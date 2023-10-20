/*
 * Copyright Traceloop
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type * as openai from "openai";
import {
  context,
  trace,
  Span,
  Attributes,
  SpanKind,
  SpanStatusCode,
} from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
import { SemanticAttributes } from "@traceloop/ai-semantic-conventions";
import { OpenAIInstrumentationConfig } from "./types";
import {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources";

// when mongoose functions are called, we store the original call context
// and then set it as the parent for the spans created by Query/Aggregate exec()
// calls. this bypass the unlinked spans issue on thenables await operations.
export const _STORED_PARENT_SPAN: unique symbol = Symbol("stored-parent-span");

export class OpenAIInstrumentation extends InstrumentationBase<any> {
  constructor(config: OpenAIInstrumentationConfig = {}) {
    super(
      "@traceloop/instrumentation-openai",
      require("../package.json").version,
      config,
    );
  }

  protected init(): InstrumentationModuleDefinition<any> {
    const module = new InstrumentationNodeModuleDefinition<any>(
      "openai",
      [">=4.12 <5"],
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return module;
  }

  private patch(moduleExports: typeof openai) {
    this._wrap(
      moduleExports.OpenAI.Chat.Completions.prototype,
      "create",
      this.patchOpenAI("chat"),
    );

    return moduleExports;
  }

  private unpatch(moduleExports: typeof openai): void {
    this._unwrap(moduleExports.OpenAI.Chat.Completions.prototype, "create");
    this._unwrap(moduleExports.OpenAI.Completions.prototype, "create");
  }

  private patchOpenAI(type: string) {
    const plugin = this;
    return (original: Function) => {
      return function method(this: any, ...args: unknown[]) {
        const span = plugin.startSpan(
          type,
          args[0] as ChatCompletionCreateParamsNonStreaming,
        );

        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          (error) => {
            if (error) {
            }
          },
        );

        const wrappedPromise = wrapPromise(span, execPromise);

        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  private startSpan(
    type: string,
    params: ChatCompletionCreateParamsNonStreaming,
  ): Span {
    const attributes: Attributes = {
      [SemanticAttributes.LLM_VENDOR]: "OpenAI",
      [SemanticAttributes.LLM_REQUEST_TYPE]: type,
    };

    attributes[SemanticAttributes.LLM_REQUEST_MODEL] = params.model;
    if (params.max_tokens) {
      attributes[SemanticAttributes.LLM_REQUEST_MAX_TOKENS] = params.max_tokens;
    }
    if (params.temperature) {
      attributes[SemanticAttributes.LLM_TEMPERATURE] = params.temperature;
    }
    if (params.top_p) {
      attributes[SemanticAttributes.LLM_TOP_P] = params.top_p;
    }
    if (params.frequency_penalty) {
      attributes[SemanticAttributes.LLM_FREQUENCY_PENALTY] =
        params.frequency_penalty;
    }
    if (params.presence_penalty) {
      attributes[SemanticAttributes.LLM_PRESENCE_PENALTY] =
        params.presence_penalty;
    }

    params.messages.forEach((message, index) => {
      attributes[`${SemanticAttributes.LLM_PROMPTS}.${index}.role`] =
        message.role;
      attributes[`${SemanticAttributes.LLM_PROMPTS}.${index}.content`] =
        message.content || "";
    });

    return this.tracer.startSpan(`openai.${type}`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
  }
}

function wrapPromise<T>(span: Span, promise: Promise<T>): Promise<T> {
  return promise
    .then((result) => {
      return new Promise<T>((resolve) => {
        endSpan(span, result as ChatCompletion);
        resolve(result);
      });
    })
    .catch((error: Error) => {
      return new Promise<T>((_, reject) => {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.recordException(error);
        span.end();

        reject(error);
      });
    });
}

function endSpan(span: Span, result: ChatCompletion) {
  span.setAttribute(SemanticAttributes.LLM_RESPONSE_MODEL, result.model);
  if (result.usage) {
    span.setAttribute(
      SemanticAttributes.LLM_USAGE_TOTAL_TOKENS,
      result.usage?.total_tokens,
    );
    span.setAttribute(
      SemanticAttributes.LLM_USAGE_COMPLETION_TOKENS,
      result.usage?.completion_tokens,
    );
    span.setAttribute(
      SemanticAttributes.LLM_USAGE_PROMPT_TOKENS,
      result.usage?.prompt_tokens,
    );
  }

  result.choices.forEach((choice, index) => {
    span.setAttribute(
      `${SemanticAttributes.LLM_COMPLETIONS}.${index}.finish_reason`,
      choice.finish_reason,
    );
    span.setAttribute(
      `${SemanticAttributes.LLM_COMPLETIONS}.${index}.role`,
      choice.message.role,
    );
    span.setAttribute(
      `${SemanticAttributes.LLM_COMPLETIONS}.${index}.content`,
      choice.message.content ?? "",
    );

    if (choice.message.function_call) {
      span.setAttribute(
        `${SemanticAttributes.LLM_COMPLETIONS}.${index}.function_call.name`,
        choice.message.function_call.name,
      );
      span.setAttribute(
        `${SemanticAttributes.LLM_COMPLETIONS}.${index}.function_call.arguments`,
        choice.message.function_call.arguments,
      );
    }
  });

  span.end();
}
