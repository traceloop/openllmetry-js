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
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
} from "@opentelemetry/instrumentation";
import { BedrockInstrumentationConfig } from "./types";
import * as bedrock from "@aws-sdk/client-bedrock-runtime";

export class BedrockInstrumentation extends InstrumentationBase<any> {
  protected override _config!: BedrockInstrumentationConfig;

  constructor(config: BedrockInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-bedrock", "0.0.17", config);
  }

  public override setConfig(config: BedrockInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition<any> {
    const aiPlatformModule = new InstrumentationNodeModuleDefinition<any>(
      "@aws-sdk/client-bedrock-runtime",
      [">=3.499.0"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );

    return aiPlatformModule;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public manuallyInstrument(module: typeof bedrock) {
    // this._wrap(
    //   module.BedrockRuntime.prototype,
    //   "invokeModel",
    //   this.wrapperMethod(),
    // );
  }

  private wrap(module: typeof bedrock) {
    return module;
  }

  private unwrap(): void {}
}
