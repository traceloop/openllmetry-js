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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { context } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
} from "@opentelemetry/instrumentation";
import { CONTEXT_KEY_ALLOW_TRACE_CONTENT } from "@traceloop/ai-semantic-conventions";
import { LangChainInstrumentationConfig } from "./types";
import { taskWrapper, workflowWrapper } from "./utils";
import type * as ChainsModule from "langchain/chains";
import type * as AgentsModule from "langchain/agents";
import type * as ToolsModule from "langchain/tools";
import type * as VectorStoreModule from "@langchain/core/vectorstores";
import type * as RunnablesModule from "@langchain/core/runnables";
import { version } from "../package.json";

export class LangChainInstrumentation extends InstrumentationBase {
  declare protected _config: LangChainInstrumentationConfig;

  constructor(config: LangChainInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-langchain", version, config);
  }

  public manuallyInstrument({
    chainsModule,
    agentsModule,
    toolsModule,
    vectorStoreModule,
    runnablesModule,
  }: {
    chainsModule?: any;
    agentsModule?: any;
    toolsModule?: any;
    vectorStoreModule?: any;
    runnablesModule?: any;
  }) {
    if (chainsModule) {
      this._diag.debug("Manually instrumenting langchain chains");
      this.patchChainModule(chainsModule);
    }
    if (agentsModule) {
      this._diag.debug("Manually instrumenting langchain agents");
      this.patchAgentModule(agentsModule);
    }
    if (toolsModule) {
      this._diag.debug("Manually instrumenting langchain tools");
      this.patchToolsModule(toolsModule);
    }
    if (vectorStoreModule) {
      this._diag.debug("Manually instrumenting langchain vector stores");
      this.patchVectorStoreModule(vectorStoreModule);
    }
    if (runnablesModule) {
      this._diag.debug("Manually instrumenting @langchain/core/runnables");
      this.patchRunnablesModule(runnablesModule);
    }
  }

  protected init(): InstrumentationModuleDefinition[] {
    const chainModule = new InstrumentationNodeModuleDefinition(
      "langchain/chains.cjs",
      [">=0.3.0"],
      this.patchChainModule.bind(this),
      this.unpatchChainModule.bind(this),
    );
    const agentModule = new InstrumentationNodeModuleDefinition(
      "langchain/agents.cjs",
      [">=0.3.0"],
      this.patchAgentModule.bind(this),
      this.unpatchAgentModule.bind(this),
    );
    const toolsModule = new InstrumentationNodeModuleDefinition(
      "langchain/tools.cjs",
      [">=0.3.0"],
      this.patchToolsModule.bind(this),
      this.unpatchToolsModule.bind(this),
    );
    const vectorStoreModule = new InstrumentationNodeModuleDefinition(
      "langchain/core/vectorstores.cjs",
      [">=0.3.0"],
      this.patchVectorStoreModule.bind(this),
      this.unpatchVectorStoreModule.bind(this),
    );
    const runnablesModule = new InstrumentationNodeModuleDefinition(
      "@langchain/core/runnables.cjs",
      [">=0.3.0"],
      this.patchRunnablesModule.bind(this),
      this.unpatchRunnablesModule.bind(this),
    );
    return [
      chainModule,
      agentModule,
      toolsModule,
      vectorStoreModule,
      runnablesModule,
    ];
  }

  private patchChainModule(
    moduleExports: typeof ChainsModule,
    moduleVersion?: string,
  ) {
    this._diag.debug(`Patching langchain/chains.cjs@${moduleVersion}`);

    this._wrap(
      moduleExports.RetrievalQAChain.prototype,
      "_call",
      workflowWrapper(
        () => this.tracer,
        this._shouldSendPrompts(),
        "retrieval_qa.workflow",
      ),
    );
    this._wrap(
      moduleExports.BaseChain.prototype,
      "call",
      taskWrapper(() => this.tracer, this._shouldSendPrompts()),
    );
    return moduleExports;
  }

  private patchAgentModule(
    moduleExports: typeof AgentsModule,
    moduleVersion?: string,
  ) {
    this._diag.debug(`Patching langchain/agents.cjs@${moduleVersion}`);

    this._wrap(
      moduleExports.AgentExecutor.prototype,
      "_call",
      workflowWrapper(
        () => this.tracer,
        this._shouldSendPrompts(),
        "langchain.agent",
      ),
    );
    return moduleExports;
  }

  private patchToolsModule(
    moduleExports: typeof ToolsModule,
    moduleVersion?: string,
  ) {
    this._diag.debug(`Patching langchain/tools.cjs@${moduleVersion}`);

    this._wrap(
      moduleExports.Tool.prototype,
      "call",
      taskWrapper(() => this.tracer, this._shouldSendPrompts()),
    );
    return moduleExports;
  }

  private patchVectorStoreModule(
    moduleExports: typeof VectorStoreModule,
    moduleVersion?: string,
  ) {
    this._diag.debug(`Patching langchain/vectorstores.cjs@${moduleVersion}`);

    this._wrap(
      moduleExports.VectorStoreRetriever.prototype,
      "_getRelevantDocuments",
      taskWrapper(() => this.tracer, this._shouldSendPrompts()),
    );
    return moduleExports;
  }

  private patchRunnablesModule(
    moduleExports: typeof RunnablesModule,
    moduleVersion?: string,
  ) {
    this._diag.debug(`Patching @langchain/core/runnables@${moduleVersion}`);

    this._wrap(
      moduleExports.RunnableSequence.prototype,
      "invoke",
      taskWrapper(() => this.tracer, this._shouldSendPrompts()),
    );
    return moduleExports;
  }

  private unpatchChainModule(
    moduleExports: typeof ChainsModule,
    moduleVersion?: string,
  ) {
    this._diag.debug(`Unpatching langchain/chains.cjs@${moduleVersion}`);

    this._unwrap(moduleExports.RetrievalQAChain.prototype, "_call");
    this._unwrap(moduleExports.BaseChain.prototype, "call");
    return moduleExports;
  }

  private unpatchAgentModule(
    moduleExports: typeof AgentsModule,
    moduleVersion?: string,
  ) {
    this._diag.debug(`Unpatching langchain/agents.cjs@${moduleVersion}`);

    this._unwrap(moduleExports.AgentExecutor.prototype, "_call");
    return moduleExports;
  }

  private unpatchToolsModule(moduleExports: typeof ToolsModule) {
    this._diag.debug(`Unpatching langchain/tools.cjs`);

    this._unwrap(moduleExports.Tool.prototype, "call");
    return moduleExports;
  }

  private unpatchVectorStoreModule(moduleExports: typeof VectorStoreModule) {
    this._diag.debug(`Unpatching langchain/vectorstores.cjs`);

    this._unwrap(
      moduleExports.VectorStoreRetriever.prototype,
      "_getRelevantDocuments",
    );
    return moduleExports;
  }

  private unpatchRunnablesModule(moduleExports: typeof RunnablesModule) {
    this._diag.debug(`Unpatching @langchain/core/runnables`);

    this._unwrap(moduleExports.Runnable.prototype, "invoke");
    return moduleExports;
  }

  private _shouldSendPrompts() {
    const contextShouldSendPrompts = context
      .active()
      .getValue(CONTEXT_KEY_ALLOW_TRACE_CONTENT);

    if (contextShouldSendPrompts !== undefined) {
      return !!contextShouldSendPrompts;
    }

    return this._config.traceContent !== undefined
      ? this._config.traceContent
      : true;
  }
}
