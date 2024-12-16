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
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
} from "@opentelemetry/instrumentation";

import { LlamaIndexInstrumentationConfig } from "./types";
import { CustomLLMInstrumentation } from "./custom-llm-instrumentation";
import { genericWrapper, shouldSendPrompts } from "./utils";

import type {
  BaseEmbedding,
  BaseSynthesizer,
  LLM,
  BaseRetriever,
} from "llamaindex";
import { TraceloopSpanKindValues } from "@traceloop/ai-semantic-conventions";
import { version } from "../package.json";

export class LlamaIndexInstrumentation extends InstrumentationBase {
  declare protected _config: LlamaIndexInstrumentationConfig;

  constructor(config: LlamaIndexInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-llamaindex", version, config);
  }

  public override setConfig(config: LlamaIndexInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  public manuallyInstrument(module: typeof llamaindex) {
    this._diag.debug("Manually instrumenting llamaindex");

    this.patch(module);
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      "llamaindex",
      [">=0.1.0"],
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
    return !!(embedding as BaseEmbedding)?.getQueryEmbedding;
  }

  private isSynthesizer(synthesizer: any): synthesizer is BaseSynthesizer {
    return (
      synthesizer && (synthesizer as BaseSynthesizer).synthesize !== undefined
    );
  }

  private isRetriever(retriever: any): retriever is BaseRetriever {
    return retriever && (retriever as BaseRetriever).retrieve !== undefined;
  }

  private patch(moduleExports: typeof llamaindex, moduleVersion?: string) {
    this._diag.debug(`Patching llamaindex@${moduleVersion}`);

    const customLLMInstrumentation = new CustomLLMInstrumentation(
      this._config,
      this._diag,
      () => this.tracer, // this is on purpose. Tracer may change
    );

    this._wrap(
      moduleExports.RetrieverQueryEngine.prototype,
      "query",
      genericWrapper(
        moduleExports.RetrieverQueryEngine.name,
        "query",
        TraceloopSpanKindValues.WORKFLOW,
        () => this.tracer,
        shouldSendPrompts(this._config),
      ),
    );

    this._wrap(
      moduleExports.ContextChatEngine.prototype,
      "chat",
      genericWrapper(
        moduleExports.ContextChatEngine.name,
        "chat",
        TraceloopSpanKindValues.WORKFLOW,
        () => this.tracer,
        shouldSendPrompts(this._config),
      ),
    );

    this._wrap(
      moduleExports.OpenAIAgent.prototype,
      "chat",
      genericWrapper(
        moduleExports.OpenAIAgent.name,
        "agent",
        TraceloopSpanKindValues.AGENT,
        () => this.tracer,
        shouldSendPrompts(this._config),
      ),
    );

    for (const key in moduleExports) {
      const cls = (moduleExports as any)[key];
      if (this.isLLM(cls.prototype)) {
        this._wrap(
          cls.prototype,
          "chat",
          customLLMInstrumentation.chatWrapper({ className: cls.name }),
        );
      } else if (this.isEmbedding(cls.prototype)) {
        this._wrap(
          cls.prototype,
          "getQueryEmbedding",
          genericWrapper(
            cls.name,
            "getQueryEmbedding",
            TraceloopSpanKindValues.TASK,
            () => this.tracer,
            shouldSendPrompts(this._config),
          ),
        );
      } else if (this.isSynthesizer(cls.prototype)) {
        this._wrap(
          cls.prototype,
          "synthesize",
          genericWrapper(
            cls.name,
            "synthesize",
            TraceloopSpanKindValues.TASK,
            () => this.tracer,
            shouldSendPrompts(this._config),
          ),
        );
      } else if (this.isRetriever(cls.prototype)) {
        this._wrap(
          cls.prototype,
          "retrieve",
          genericWrapper(
            cls.name,
            "retrieve",
            TraceloopSpanKindValues.TASK,
            () => this.tracer,
            shouldSendPrompts(this._config),
          ),
        );
      }
    }

    return moduleExports;
  }

  private unpatch(moduleExports: typeof llamaindex, moduleVersion?: string) {
    this._diag.debug(`Unpatching llamaindex@${moduleVersion}`);

    this._unwrap(moduleExports.RetrieverQueryEngine.prototype, "query");

    for (const key in moduleExports) {
      const cls = (moduleExports as any)[key];
      if (this.isLLM(cls.prototype)) {
        this._unwrap(cls.prototype, "complete");
        this._unwrap(cls.prototype, "chat");
      } else if (this.isEmbedding(cls.prototype)) {
        this._unwrap(cls.prototype, "getQueryEmbedding");
      } else if (this.isSynthesizer(cls.prototype)) {
        this._unwrap(cls.prototype, "synthesize");
      } else if (this.isRetriever(cls.prototype)) {
        this._unwrap(cls.prototype, "retrieve");
      }
    }

    return moduleExports;
  }
}
