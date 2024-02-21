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
import { ChromaDBInstrumentationConfig } from "./types";
import * as chromadb from "chromadb";

export class ChromaDBInstrumentation extends InstrumentationBase<any> {
  protected override _config!: ChromaDBInstrumentationConfig;

  constructor(config: ChromaDBInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-chromadb", "0.3.11", config);
  }

  public override setConfig(config: ChromaDBInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition<any> {
    const module = new InstrumentationNodeModuleDefinition<any>(
      "cohere-ai",
      [">=7.7.5"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );

    return module;
  }

  public manuallyInstrument(module: typeof chromadb) {
    return module;
  }

  private wrap(module: typeof chromadb) {
    return module;
  }

  private unwrap() {}
}
