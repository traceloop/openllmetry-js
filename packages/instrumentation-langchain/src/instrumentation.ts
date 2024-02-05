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
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
} from "@opentelemetry/instrumentation";
import { LangChainInstrumentationConfig } from "./types";
import { taskWrapper, workflowWrapper } from "./utils";
import type * as ChainsModule from "langchain/chains";
import type * as AgentsModule from "langchain/agents";
import type * as ToolsModule from "langchain/tools";

export class LangChainInstrumentation extends InstrumentationBase<any> {
  constructor(config: LangChainInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-langchain", "0.3.0", config);
  }

  public manuallyInstrument(module: any & { openLLMetryPatched?: boolean }) {
    if (module.openLLMetryPatched) {
      return;
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
    this._wrap(
      moduleExports.RetrievalQAChain.prototype,
      "_call",
      workflowWrapper(this.tracer, "retrieval_qa.workflow"),
    );
    this._wrap(
      moduleExports.BaseChain.prototype,
      "call",
      taskWrapper(this.tracer),
    );
    return moduleExports;
  }

  private patchAgentModule(
    moduleExports: typeof AgentsModule & { openLLMetryPatched?: boolean },
  ) {
    this._wrap(
      moduleExports.AgentExecutor.prototype,
      "_call",
      workflowWrapper(this.tracer, "langchain.agent"),
    );
    return moduleExports;
  }

  private patchToolsModule(
    moduleExports: typeof ToolsModule & { openLLMetryPatched?: boolean },
  ) {
    this._wrap(moduleExports.Tool.prototype, "call", taskWrapper(this.tracer));
    return moduleExports;
  }

  private unpatchChainModule(
    moduleExports: any & { openLLMetryPatched?: boolean },
  ) {
    this._unwrap(moduleExports.RetrievalQAChain.prototype, "_call");
    this._unwrap(moduleExports.BaseChain.prototype, "call");
    return moduleExports;
  }

  private unpatchAgentModule(
    moduleExports: any & { openLLMetryPatched?: boolean },
  ) {
    this._unwrap(moduleExports.AgentExecutor.prototype, "_call");
    return moduleExports;
  }

  private unpatchToolsModule(
    moduleExports: any & { openLLMetryPatched?: boolean },
  ) {
    this._unwrap(moduleExports.AgentExecutor.prototype, "_call");
    return moduleExports;
  }
}
