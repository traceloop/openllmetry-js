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

export class LangChainInstrumentation extends InstrumentationBase<any> {
  protected override _config!: LangChainInstrumentationConfig;

  constructor(config: LangChainInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-langchain", "0.3.0", config);
  }

  public manuallyInstrument({
    chainsModule,
    agentsModule,
    toolsModule,
  }: {
    chainsModule?: any & { openLLMetryPatched?: boolean };
    agentsModule?: any & { openLLMetryPatched?: boolean };
    toolsModule?: any & { openLLMetryPatched?: boolean };
  }) {
    if (chainsModule) {
      this.patchChainModule(chainsModule);
    }
    if (agentsModule) {
      this.patchAgentModule(agentsModule);
    }
    if (toolsModule) {
      this.patchToolsModule(toolsModule);
    }
  }

  protected init(): InstrumentationModuleDefinition<any>[] {
    const chainModule = new InstrumentationNodeModuleDefinition<any>(
      "langchain/chains.cjs",
      [">=0.1.7"],
      this.patchChainModule.bind(this),
      this.unpatchChainModule.bind(this),
    );
    const agentModule = new InstrumentationNodeModuleDefinition<any>(
      "langchain/agents.cjs",
      [">=0.1.7"],
      this.patchAgentModule.bind(this),
      this.unpatchAgentModule.bind(this),
    );
    const toolsModule = new InstrumentationNodeModuleDefinition<any>(
      "langchain/tools.cjs",
      [">=0.1.7"],
      this.patchToolsModule.bind(this),
      this.unpatchToolsModule.bind(this),
    );
    return [chainModule, agentModule, toolsModule];
  }

  private patchChainModule(
    moduleExports: typeof ChainsModule & { openLLMetryPatched?: boolean },
  ) {
    if (moduleExports.openLLMetryPatched) {
      return moduleExports;
    }

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
    moduleExports: typeof AgentsModule & { openLLMetryPatched?: boolean },
  ) {
    if (moduleExports.openLLMetryPatched) {
      return moduleExports;
    }

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
    moduleExports: typeof ToolsModule & { openLLMetryPatched?: boolean },
  ) {
    if (moduleExports.openLLMetryPatched) {
      return moduleExports;
    }

    this._wrap(
      moduleExports.Tool.prototype,
      "call",
      taskWrapper(() => this.tracer, this._shouldSendPrompts()),
    );
    return moduleExports;
  }

  private unpatchChainModule(
    moduleExports: any & { openLLMetryPatched?: boolean },
  ) {
    moduleExports.openLLMetryPatched = false;

    this._unwrap(moduleExports.RetrievalQAChain.prototype, "_call");
    this._unwrap(moduleExports.BaseChain.prototype, "call");
    return moduleExports;
  }

  private unpatchAgentModule(
    moduleExports: any & { openLLMetryPatched?: boolean },
  ) {
    moduleExports.openLLMetryPatched = false;

    this._unwrap(moduleExports.AgentExecutor.prototype, "_call");
    return moduleExports;
  }

  private unpatchToolsModule(
    moduleExports: any & { openLLMetryPatched?: boolean },
  ) {
    moduleExports.openLLMetryPatched = false;

    this._unwrap(moduleExports.AgentExecutor.prototype, "_call");
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
