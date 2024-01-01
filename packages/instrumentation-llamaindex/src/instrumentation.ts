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
import type * as llamaindex from "llamaindex";

import {
  context,
  trace,
  SpanStatusCode,
} from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { LlamaIndexInstrumentationConfig } from "./types";
import {
    BaseEmbedding,
    BaseSynthesizer,
    LLM,
    BaseRetriever
} from 'llamaindex';

export class LlamaIndexInstrumentation extends InstrumentationBase<any> {
  protected override _config!: LlamaIndexInstrumentationConfig;

  constructor(config: LlamaIndexInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-llamaindex", "0.0.17", config);
  }

  public override setConfig(config: LlamaIndexInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  public manuallyInstrument(
    module: typeof llamaindex & { openLLMetryPatched?: boolean },
  ) {
    if (module.openLLMetryPatched) {
      return;
    }
  }

  protected init(): InstrumentationModuleDefinition<any> {
    const module = new InstrumentationNodeModuleDefinition<any>(
      "llamaindex",
      [">=0.0.40"],
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return module;
  }

  private isLLM(llm: any): llm is LLM {
    return (
      llm &&
      (llm as LLM).complete !== undefined &&
      (llm as LLM).chat !== undefined
    );
  }

  private isEmbedding(embedding: any): embedding is BaseEmbedding {
    return embedding instanceof BaseEmbedding && embedding.getQueryEmbedding !== undefined;
  }

  private isSynthesizer(synthesizer: any): synthesizer is BaseSynthesizer {
    return synthesizer && (synthesizer as BaseSynthesizer).synthesize !== undefined;
  }

  private isRetriever(retriever: any): retriever is BaseRetriever {
    return retriever && (retriever as BaseRetriever).retrieve !== undefined;
  }

  private patch(
    moduleExports: typeof llamaindex & { openLLMetryPatched?: boolean },
  ) {
    if (moduleExports.openLLMetryPatched) {
      return moduleExports;
    }

    this._wrap(
      moduleExports.RetrieverQueryEngine.prototype,
      "query",
      this.genericWrapper("RetrieverQueryEngine", "query"),
    );

    for (const key in moduleExports) {
      const cls = (moduleExports as any)[key];
      if (this.isLLM(cls.prototype)) {
        this._wrap(
          cls.prototype,
          "complete",
          this.completeWrapper({ className: cls.name }),
        );
        this._wrap(
          cls.prototype,
          "chat",
          this.chatWrapper({ className: cls.name }),
        );
      } else if (this.isEmbedding(cls.prototype)) {
        this._wrap(
          cls.prototype,
          "getQueryEmbedding",
          this.genericWrapper(cls.name, "getQueryEmbedding")
        );
      } else if (this.isSynthesizer(cls.prototype)) {
        this._wrap(
          cls.prototype,
          "synthesize",
          this.genericWrapper(cls.name, "synthesize")
        );
      } else if (this.isRetriever(cls.prototype)) {
        this._wrap(
          cls.prototype,
          "retrieve",
          this.genericWrapper(cls.name, "retrieve")
        );
      }
    }

    return moduleExports;
  }

  private unpatch(
    moduleExports: typeof llamaindex & { openLLMetryPatched?: boolean },
  ) {
    this._unwrap(
      moduleExports.RetrieverQueryEngine.prototype,
      "query",
    );

    for (const key in moduleExports) {
      const cls = (moduleExports as any)[key];
      if (this.isLLM(cls.prototype)) {
        this._unwrap(
          cls.prototype,
          "complete",
        );
        this._unwrap(
          cls.prototype,
          "chat",
        );
      } else if (this.isEmbedding(cls.prototype)) {
        this._unwrap(
          cls.prototype,
          "getQueryEmbedding",
        );
      } else if (this.isSynthesizer(cls.prototype)) {
        this._unwrap(
          cls.prototype,
          "synthesize",
        );
      } else if (this.isRetriever(cls.prototype)) {
        this._unwrap(
          cls.prototype,
          "retrieve",
        );
      }
    }

    return moduleExports;
  }

  private genericWrapper(className: string, methodName: string) {
    const plugin = this;
    return (original: Function) => {
      return function method(this: BaseEmbedding, ...args: unknown[]) {
        const span = plugin.tracer.startSpan(
          `llamaindex.${className}.${methodName}`
        );
        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          (error) => {}
        );
        const wrappedPromise = execPromise
        .then((result: any) => {
          return new Promise((resolve) => {
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            resolve(result);
          });
        })
        .catch((error: Error) => {
          return new Promise((_, reject) => {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            span.end();
            reject(error);
          });
        })
        return context.bind(execContext, wrappedPromise as any);
      }
    };
  };

  private completeWrapper({
    className
  }: {
    className: string
  }) {
    const plugin = this;
    return (original: Function) => {
      return function method(this: llamaindex.LLM, ...args: unknown[]) {
        const prompt = args[0];

        const span = plugin.tracer.startSpan(
          `llamaindex.${className}.complete`
        );

        span.setAttribute(SpanAttributes.LLM_VENDOR, 'llamaindex');
        span.setAttribute(SpanAttributes.LLM_REQUEST_MODEL, this.metadata.model);
        span.setAttribute(SpanAttributes.LLM_REQUEST_TYPE, "complete");
        span.setAttribute(SpanAttributes.LLM_TOP_P, this.metadata.topP);
        if (plugin._shouldSendPrompts()) {
          span.setAttribute(`${SpanAttributes.LLM_PROMPTS}.0.content`, prompt as string);
        }

        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          (error) => {}
        );
        const wrappedPromise = execPromise
        .then((result: any) => {
          return new Promise((resolve) => {
            span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, this.metadata.model);
            if (plugin._shouldSendPrompts()) {
              span.setAttribute(`${SpanAttributes.LLM_COMPLETIONS}.0.role`, result.message.role);
              span.setAttribute(`${SpanAttributes.LLM_COMPLETIONS}.0.content`, result.message.content);
            }
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            resolve(result);
          });
        })
        .catch((error: Error) => {
          return new Promise((_, reject) => {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            span.end();
            reject(error);
          });
        })
        return context.bind(execContext, wrappedPromise as any);
      };
    }
  }

  private chatWrapper({
    className
  }: {
    className: string
  }) {
    const plugin = this;
    return (original: Function) => {
      return function method(this: llamaindex.LLM, ...args: unknown[]) {
        const messages = args[0] as llamaindex.ChatMessage[];

        const span = plugin.tracer.startSpan(
          `llamaindex.${className}.chat`
        );

        span.setAttribute(SpanAttributes.LLM_VENDOR, 'llamaindex');
        span.setAttribute(SpanAttributes.LLM_REQUEST_MODEL, this.metadata.model);
        span.setAttribute(SpanAttributes.LLM_REQUEST_TYPE, "chat");
        span.setAttribute(SpanAttributes.LLM_TOP_P, this.metadata.topP);
        if (plugin._shouldSendPrompts()) {
          for (const messageIdx in messages) {
            span.setAttribute(`${SpanAttributes.LLM_PROMPTS}.${messageIdx}.content`, messages[messageIdx].content);
            span.setAttribute(`${SpanAttributes.LLM_PROMPTS}.${messageIdx}.role`, messages[messageIdx].role);
          }
        }

        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          (error) => {}
        );
        const wrappedPromise = execPromise
        .then((result: any) => {
          return new Promise((resolve) => {
            span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, this.metadata.model);
            if (plugin._shouldSendPrompts()) {
              span.setAttribute(`${SpanAttributes.LLM_COMPLETIONS}.0.role`, result.message.role);
              span.setAttribute(`${SpanAttributes.LLM_COMPLETIONS}.0.content`, result.message.content);
            }
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            resolve(result);
          });
        })
        .catch((error: Error) => {
          return new Promise((_, reject) => {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            span.end();
            reject(error);
          });
        })
        return context.bind(execContext, wrappedPromise as any);
      };
    }
  }

  private _shouldSendPrompts() {
    return this._config.traceContent !== undefined
      ? this._config.traceContent
      : true;
  }
}

