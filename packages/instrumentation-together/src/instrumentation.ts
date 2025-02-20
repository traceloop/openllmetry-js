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
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from "@opentelemetry/instrumentation";
import { SpanKind, SpanStatusCode, context, trace } from "@opentelemetry/api";
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { TogetherInstrumentationConfig } from "./types";

export class TogetherInstrumentation extends InstrumentationBase {
  constructor(config: TogetherInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-together", "0.1.0", config);
  }

  protected init(): InstrumentationNodeModuleDefinition[] {
    const module = new InstrumentationNodeModuleDefinition(
      "together-ai",
      ["*"],
      (moduleExports) => {
        this._diag.debug("Applying patch for together-ai");
        const together = moduleExports;

        if (together?.Together?.prototype) {
          const client = new together.Together({ apiKey: "test" });
          this._wrap(
            Object.getPrototypeOf(client.chat.completions),
            "create",
            this._patchChatCompletions(),
          );
        }

        return moduleExports;
      },
      (moduleExports) => {
        if (moduleExports?.Together?.prototype) {
          const client = new moduleExports.Together({ apiKey: "test" });
          this._unwrap(
            Object.getPrototypeOf(client.chat.completions),
            "create",
          );
        }
      },
    );

    return [module];
  }

  private _patchChatCompletions() {
    const instrumentation = this;

    return function (original: (...args: unknown[]) => Promise<unknown>) {
      return async function wrapped(this: unknown, ...args: unknown[]) {
        const params = args[0] || {};

        const span = instrumentation.tracer.startSpan("together.chat", {
          kind: SpanKind.CLIENT,
          attributes: {
            [SemanticAttributes.HTTP_METHOD]: "POST",
            [SemanticAttributes.HTTP_URL]:
              "https://api.together.xyz/v1/chat/completions",
            [SpanAttributes.LLM_SYSTEM]: "together",
            [SpanAttributes.LLM_REQUEST_MODEL]: (params as any).model,
            [SpanAttributes.LLM_REQUEST_MAX_TOKENS]: (params as any).max_tokens,
            [SpanAttributes.LLM_REQUEST_TEMPERATURE]: (params as any)
              .temperature,
            [SpanAttributes.LLM_REQUEST_TOP_P]: (params as any).top_p,
            [SpanAttributes.LLM_FREQUENCY_PENALTY]: (params as any)
              .frequency_penalty,
            [SpanAttributes.LLM_PRESENCE_PENALTY]: (params as any)
              .presence_penalty,
          },
        });

        // Set prompt attributes
        if ((params as any).messages) {
          (params as any).messages.forEach((message: any, index: number) => {
            span.setAttribute(
              `${SpanAttributes.LLM_PROMPTS}.${index}.role`,
              message.role,
            );
            span.setAttribute(
              `${SpanAttributes.LLM_PROMPTS}.${index}.content`,
              message.content,
            );
          });
        }

        let response;
        try {
          response = await context.with(
            trace.setSpan(context.active(), span),
            async () => original.apply(this, args),
          );

          if ((params as any).stream) {
            let content = "";
            const streamResponse = response as AsyncIterable<any>;
            const originalIterator = streamResponse[Symbol.asyncIterator]();

            const wrappedIterator = {
              [Symbol.asyncIterator]() {
                return this;
              },
              async next() {
                const result = await originalIterator.next();

                if (!result.done) {
                  const chunk = result.value;
                  content += chunk.choices[0]?.delta?.content || "";

                  if (chunk.usage) {
                    span.setAttribute(
                      `${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`,
                      chunk.usage.prompt_tokens,
                    );
                    span.setAttribute(
                      `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`,
                      chunk.usage.completion_tokens,
                    );
                    span.setAttribute(
                      `${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`,
                      chunk.usage.total_tokens,
                    );
                  }
                } else {
                  span.setAttribute(
                    `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
                    content,
                  );
                  span.end();
                }

                return result;
              },
            };

            return wrappedIterator;
          } else {
            if ((response as any).choices?.[0]?.message?.content) {
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
                (response as any).choices[0].message.content,
              );
            }

            if ((response as any).usage) {
              span.setAttribute(
                `${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`,
                (response as any).usage.prompt_tokens,
              );
              span.setAttribute(
                `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`,
                (response as any).usage.completion_tokens,
              );
              span.setAttribute(
                `${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`,
                (response as any).usage.total_tokens,
              );
            }

            span.end();
          }
        } catch (error: any) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error?.message,
          });
          span.end();
          throw error;
        }

        return response;
      };
    };
  }
}
