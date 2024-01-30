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
import type * as LangChainChatOpenAI from "langchain/chat_models/openai";
// import {
//   context,
//   trace,
//   Span,
//   Attributes,
//   SpanKind,
//   SpanStatusCode,
// } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  // safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
// import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { LangChainInstrumentationConfig } from "./types";
// import {
//   ChatCompletion,
//   ChatCompletionCreateParamsNonStreaming,
//   Completion,
//   CompletionCreateParamsNonStreaming,
// } from "openai/resources";

export class LangChainInstrumentation extends InstrumentationBase<any> {
  constructor(config: LangChainInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-langchain", "0.0.1", config);
  }

  public manuallyInstrument(
    module: typeof LangChainChatOpenAI & { openLLMetryPatched?: boolean },
  ) {
    if (module.openLLMetryPatched) {
      return;
    }

    // this._wrap(
    //   module.ChatOpenAI.prototype,
    //   "_generate",
    //   this.patchOpenAI("chat"),
    // );
    // this._wrap(
    //   module.Completions.prototype,
    //   "create",
    //   this.patchOpenAI("completion"),
    // );
  }

  protected init(): InstrumentationModuleDefinition<any>[] {
    console.log("HEYY");
    const chatModule = new InstrumentationNodeModuleDefinition<any>(
      "langchain/chat_models/openai",
      [">=0.0.184"],
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return [chatModule];
  }

  private patch(moduleExports: any & { openLLMetryPatched?: boolean }) {
    // if (moduleExports.openLLMetryPatched) {
    //   return moduleExports;
    // }

    console.log("YOOO");

    // moduleExports.openLLMetryPatched = true;
    // this._wrap(
    //   moduleExports.OpenAI.Chat.Completions.prototype,
    //   "create",
    //   this.patchOpenAI("chat"),
    // );
    // this._wrap(
    //   moduleExports.OpenAI.Completions.prototype,
    //   "create",
    //   this.patchOpenAI("completion"),
    // );

    return moduleExports;
  }

  private unpatch(moduleExports: typeof LangChainChatOpenAI): void {
    // this._unwrap(moduleExports.OpenAI.Chat.Completions.prototype, "create");
    // this._unwrap(moduleExports.OpenAI.Completions.prototype, "create");
  }

  //   private patchOpenAI(
  //     type: "chat" | "completion",
  //     version: "v3" | "v4" = "v4",
  //   ) {
  //     // eslint-disable-next-line @typescript-eslint/no-this-alias
  //     const plugin = this;
  //     // eslint-disable-next-line @typescript-eslint/ban-types
  //     return (original: Function) => {
  //       return function method(this: any, ...args: unknown[]) {
  //         const span =
  //           type === "chat"
  //             ? plugin.startSpan({
  //                 type,
  //                 params: args[0] as ChatCompletionCreateParamsNonStreaming & {
  //                   extraAttributes?: Record<string, any>;
  //                 },
  //               })
  //             : plugin.startSpan({
  //                 type,
  //                 params: args[0] as CompletionCreateParamsNonStreaming & {
  //                   extraAttributes?: Record<string, any>;
  //                 },
  //               });

  //         const execContext = trace.setSpan(context.active(), span);
  //         const execPromise = safeExecuteInTheMiddle(
  //           () => {
  //             return context.with(execContext, () => {
  //               if ((args?.[0] as any)?.extraAttributes) {
  //                 delete (args[0] as any).extraAttributes;
  //               }
  //               return original.apply(this, args);
  //             });
  //           },
  //           (error) => {
  //             // if (error) {
  //             // }
  //           },
  //         );

  //         const wrappedPromise = wrapPromise(type, version, span, execPromise);

  //         return context.bind(execContext, wrappedPromise as any);
  //       };
  //     };
  //   }

  //   private startSpan({
  //     type,
  //     params,
  //   }:
  //     | {
  //         type: "chat";
  //         params: ChatCompletionCreateParamsNonStreaming & {
  //           extraAttributes?: Record<string, any>;
  //         };
  //       }
  //     | {
  //         type: "completion";
  //         params: CompletionCreateParamsNonStreaming & {
  //           extraAttributes?: Record<string, any>;
  //         };
  //       }): Span {
  //     const attributes: Attributes = {
  //       [SpanAttributes.LLM_VENDOR]: "OpenAI",
  //       [SpanAttributes.LLM_REQUEST_TYPE]: type,
  //     };

  //     attributes[SpanAttributes.LLM_REQUEST_MODEL] = params.model;
  //     if (params.max_tokens) {
  //       attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS] = params.max_tokens;
  //     }
  //     if (params.temperature) {
  //       attributes[SpanAttributes.LLM_TEMPERATURE] = params.temperature;
  //     }
  //     if (params.top_p) {
  //       attributes[SpanAttributes.LLM_TOP_P] = params.top_p;
  //     }
  //     if (params.frequency_penalty) {
  //       attributes[SpanAttributes.LLM_FREQUENCY_PENALTY] =
  //         params.frequency_penalty;
  //     }
  //     if (params.presence_penalty) {
  //       attributes[SpanAttributes.LLM_PRESENCE_PENALTY] = params.presence_penalty;
  //     }

  //     if (
  //       params.extraAttributes !== undefined &&
  //       typeof params.extraAttributes === "object"
  //     ) {
  //       Object.keys(params.extraAttributes).forEach((key: string) => {
  //         attributes[key] = params.extraAttributes![key];
  //       });
  //     }

  //     if (shouldSendPrompts()) {
  //       if (type === "chat") {
  //         params.messages.forEach((message, index) => {
  //           attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.role`] =
  //             message.role;
  //           attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.content`] =
  //             (message.content as string) || "";
  //         });
  //       } else {
  //         if (typeof params.prompt === "string") {
  //           attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
  //           attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] = params.prompt;
  //         }
  //       }
  //     }

  //     return this.tracer.startSpan(`openai.${type}`, {
  //       kind: SpanKind.CLIENT,
  //       attributes,
  //     });
  //   }
}

// function wrapPromise<T>(
//   type: "chat" | "completion",
//   version: "v3" | "v4",
//   span: Span,
//   promise: Promise<T>,
// ): Promise<T> {
//   return promise
//     .then((result) => {
//       return new Promise<T>((resolve) => {
//         if (version === "v3") {
//           if (type === "chat") {
//             endSpan({
//               type,
//               span,
//               result: (result as any).data as ChatCompletion,
//             });
//           } else {
//             endSpan({ type, span, result: (result as any).data as Completion });
//           }
//         } else {
//           if (type === "chat") {
//             endSpan({ type, span, result: result as ChatCompletion });
//           } else {
//             endSpan({ type, span, result: result as Completion });
//           }
//         }
//         resolve(result);
//       });
//     })
//     .catch((error: Error) => {
//       return new Promise<T>((_, reject) => {
//         span.setStatus({
//           code: SpanStatusCode.ERROR,
//           message: error.message,
//         });
//         span.recordException(error);
//         span.end();

//         reject(error);
//       });
//     });
// }

// function endSpan({
//   span,
//   type,
//   result,
// }:
//   | { span: Span; type: "chat"; result: ChatCompletion }
//   | { span: Span; type: "completion"; result: Completion }) {
//   span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, result.model);
//   if (result.usage) {
//     span.setAttribute(
//       SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
//       result.usage?.total_tokens,
//     );
//     span.setAttribute(
//       SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
//       result.usage?.completion_tokens,
//     );
//     span.setAttribute(
//       SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
//       result.usage?.prompt_tokens,
//     );
//   }

//   if (shouldSendPrompts()) {
//     if (type === "chat") {
//       result.choices.forEach((choice, index) => {
//         span.setAttribute(
//           `${SpanAttributes.LLM_COMPLETIONS}.${index}.finish_reason`,
//           choice.finish_reason,
//         );
//         span.setAttribute(
//           `${SpanAttributes.LLM_COMPLETIONS}.${index}.role`,
//           choice.message.role,
//         );
//         span.setAttribute(
//           `${SpanAttributes.LLM_COMPLETIONS}.${index}.content`,
//           choice.message.content ?? "",
//         );

//         if (choice.message.function_call) {
//           span.setAttribute(
//             `${SpanAttributes.LLM_COMPLETIONS}.${index}.function_call.name`,
//             choice.message.function_call.name,
//           );
//           span.setAttribute(
//             `${SpanAttributes.LLM_COMPLETIONS}.${index}.function_call.arguments`,
//             choice.message.function_call.arguments,
//           );
//         }
//       });
//     } else {
//       result.choices.forEach((choice, index) => {
//         span.setAttribute(
//           `${SpanAttributes.LLM_COMPLETIONS}.${index}.finish_reason`,
//           choice.finish_reason,
//         );
//         span.setAttribute(
//           `${SpanAttributes.LLM_COMPLETIONS}.${index}.role`,
//           "assistant",
//         );
//         span.setAttribute(
//           `${SpanAttributes.LLM_COMPLETIONS}.${index}.content`,
//           choice.text,
//         );
//       });
//     }
//   }

//   span.end();
// }

// function shouldSendPrompts() {
//   return (
//     (process.env.TRACELOOP_TRACE_CONTENT || "true").toLowerCase() === "true"
//   );
// }
