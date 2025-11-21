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

import { context, trace, Span, SpanStatusCode, SpanKind } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
} from "@opentelemetry/instrumentation";
import {
  SpanAttributes,
  TraceloopSpanKindValues,
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
} from "@traceloop/ai-semantic-conventions";
import { McpInstrumentationConfig } from "./types";
import { version } from "../package.json";

interface MCPRequest {
  method?: string;
  params?: unknown;
}

interface MCPToolCallParams {
  name?: string;
  arguments?: Record<string, unknown>;
}

interface MCPContent {
  text?: string;
  type?: string;
  [key: string]: unknown;
}

interface MCPResult {
  content?: MCPContent[];
  isError?: boolean;
  tools?: Array<{ name: string; description?: string }>;
  resources?: Array<{ uri: string; name?: string; description?: string }>;
  contents?: Array<{ uri: string; mimeType?: string; text?: string }>;
  messages?: Array<{ role: string; content: string | unknown }>;
  prompts?: Array<{ name: string; description?: string }>;
  [key: string]: unknown;
}

export class McpInstrumentation extends InstrumentationBase {
  protected declare _config: McpInstrumentationConfig;

  constructor(config: McpInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-mcp", version, config);
  }

  public override setConfig(config: McpInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      "@modelcontextprotocol/sdk",
      [">=1.0.0"],
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return module;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private patch(moduleExports: any, moduleVersion?: string) {
    this._diag.debug(`Patching @modelcontextprotocol/sdk@${moduleVersion}`);

    // Patch Client class
    if (moduleExports.Client) {
      this._diag.debug("Patching MCP Client");
      this._wrap(
        moduleExports.Client.prototype,
        "connect",
        this._wrapConnect.bind(this),
      );
      this._wrap(
        moduleExports.Client.prototype,
        "request",
        this._wrapRequest.bind(this, "client"),
      );
    }

    // Patch Server class
    if (moduleExports.Server) {
      this._diag.debug("Patching MCP Server");
      this._wrap(
        moduleExports.Server.prototype,
        "request",
        this._wrapRequest.bind(this, "server"),
      );
    }

    return moduleExports;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private unpatch(moduleExports: any, moduleVersion?: string): void {
    this._diag.debug(`Unpatching @modelcontextprotocol/sdk@${moduleVersion}`);

    if (moduleExports.Client) {
      this._unwrap(moduleExports.Client.prototype, "connect");
      this._unwrap(moduleExports.Client.prototype, "request");
    }

    if (moduleExports.Server) {
      this._unwrap(moduleExports.Server.prototype, "request");
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private _wrapConnect(original: Function) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function (this: any, ...args: unknown[]) {
      const span = plugin.tracer.startSpan("mcp.client.session", {
        kind: SpanKind.CLIENT,
      });

      span.setAttribute(SpanAttributes.TRACELOOP_SPAN_KIND, TraceloopSpanKindValues.SESSION);
      span.setAttribute(SpanAttributes.TRACELOOP_ENTITY_NAME, "mcp.client.session");

      const execContext = trace.setSpan(context.active(), span);

      return context.with(execContext, () => {
        try {
          const result = original.apply(this, args);

          // Handle promise
          if (result && typeof result.then === "function") {
            return result
              .then((value: unknown) => {
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
                return value;
              })
              .catch((error: Error) => {
                span.recordException(error);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                span.end();
                throw error;
              });
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        } catch (error: unknown) {
          const err = error as Error;
          span.recordException(err);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err?.message || String(error),
          });
          span.end();
          throw error;
        }
      });
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private _wrapRequest(side: "client" | "server", original: Function) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function (this: any, ...args: unknown[]) {
      const request = args[0] as MCPRequest;

      if (!request || !request.method) {
        return original.apply(this, args);
      }

      const method = request.method;
      const params = request.params;

      // Determine span name and kind based on method
      let spanName: string;
      let spanKind: string;
      let entityName: string;

      if (method === "tools/call") {
        const toolName = (params as MCPToolCallParams)?.name || "unknown";
        spanName = `${toolName}.tool`;
        entityName = toolName;
        spanKind = TraceloopSpanKindValues.TOOL;
      } else {
        spanName = `${method}.mcp`;
        entityName = method;
        spanKind = "unknown";
      }

      const span = plugin.tracer.startSpan(spanName, {
        kind: side === "client" ? SpanKind.CLIENT : SpanKind.SERVER,
      });

      span.setAttribute(SpanAttributes.TRACELOOP_SPAN_KIND, spanKind);
      span.setAttribute(SpanAttributes.TRACELOOP_ENTITY_NAME, entityName);

      // Add input attributes if traceContent is enabled
      if (plugin._shouldSendPrompts()) {
        try {
          const cleanInput = plugin._extractCleanInput(method, params);
          if (cleanInput && Object.keys(cleanInput).length > 0) {
            span.setAttribute(
              SpanAttributes.TRACELOOP_ENTITY_INPUT,
              JSON.stringify(cleanInput),
            );
          }
        } catch (error: unknown) {
          plugin._diag.debug("Error extracting input:", error);
          plugin._config.exceptionLogger?.(error as Error);
        }
      }

      const execContext = trace.setSpan(context.active(), span);

      return context.with(execContext, () => {
        try {
          const result = original.apply(this, args);

          // Handle promise
          if (result && typeof result.then === "function") {
            return result
              .then((value: unknown) => {
                plugin._handleResult(span, method, value);
                return value;
              })
              .catch((error: Error) => {
                span.recordException(error);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                span.end();
                throw error;
              });
          }

          plugin._handleResult(span, method, result);
          return result;
        } catch (error: unknown) {
          const err = error as Error;
          span.recordException(err);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err?.message || String(error),
          });
          span.end();
          throw error;
        }
      });
    };
  }

  private _handleResult(span: Span, method: string, result: unknown): void {
    try {
      // Add output attributes if traceContent is enabled
      if (this._shouldSendPrompts()) {
        const cleanOutput = this._extractCleanOutput(method, result);
        if (cleanOutput && Object.keys(cleanOutput).length > 0) {
          span.setAttribute(
            SpanAttributes.TRACELOOP_ENTITY_OUTPUT,
            JSON.stringify(cleanOutput),
          );
        }
      }

      // Check for error results
      if (result && typeof result === "object") {
        const mcpResult = result as MCPResult;
        if (mcpResult?.isError) {
          const errorMessage =
            mcpResult.content?.[0]?.text || "Unknown error";
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage,
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
    } catch (error: unknown) {
      this._diag.debug("Error handling result:", error);
      this._config.exceptionLogger?.(error as Error);
    } finally {
      span.end();
    }
  }

  private _extractCleanInput(
    method: string,
    params: unknown,
  ): Record<string, unknown> {
    if (!params) {
      return {};
    }

    try {
      if (method === "tools/call" && typeof params === "object" && params !== null) {
        const result: Record<string, unknown> = {};
        const toolParams = params as MCPToolCallParams;

        if (toolParams.name) {
          result.tool_name = toolParams.name;
        }

        if (toolParams.arguments) {
          result.arguments = toolParams.arguments;
        }

        return result;
      } else if (method === "tools/list") {
        return {};
      } else if (method === "resources/read") {
        if (typeof params === "object" && params !== null && "uri" in params) {
          return {
            uri: (params as { uri: unknown }).uri,
          };
        }
        return {};
      } else if (method === "resources/list") {
        return {};
      } else if (method === "prompts/get") {
        if (typeof params === "object" && params !== null) {
          return {
            name: "name" in params ? (params as { name: unknown }).name : undefined,
            arguments: "arguments" in params ? (params as { arguments: unknown }).arguments : undefined,
          };
        }
        return {};
      } else if (method === "prompts/list") {
        return {};
      } else {
        // For other methods, try to serialize params cleanly
        if (typeof params === "object" && params !== null) {
          const cleanParams: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(params)) {
            if (!key.startsWith("_")) {
              try {
                JSON.stringify(value);
                cleanParams[key] = value;
              } catch {
                cleanParams[key] = typeof value;
              }
            }
          }
          return cleanParams;
        }
        return { params: String(params) };
      }
    } catch (error: unknown) {
      this._diag.debug("Error extracting clean input:", error);
      this._config.exceptionLogger?.(error as Error);
      return {};
    }
  }

  private _extractCleanOutput(
    method: string,
    result: unknown,
  ): Record<string, unknown> {
    if (!result) {
      return {};
    }

    try {
      if (typeof result !== "object") {
        return { result: String(result) };
      }

      const mcpResult = result as MCPResult;

      if (method === "tools/call") {
        const output: Record<string, unknown> = {};

        if (mcpResult.content && Array.isArray(mcpResult.content) && mcpResult.content.length > 0) {
          const contentItem = mcpResult.content[0];
          if (contentItem.text !== undefined) {
            output.result = contentItem.text;
          } else if (contentItem.type) {
            output.result = contentItem;
          }
        }

        if (mcpResult.isError !== undefined) {
          output.is_error = mcpResult.isError;
        }

        return output;
      } else if (method === "tools/list") {
        const output: Record<string, unknown> = { tools: [] };
        if (mcpResult.tools && Array.isArray(mcpResult.tools)) {
          output.tools = mcpResult.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
          }));
        }
        return output;
      } else if (method === "resources/read") {
        const output: Record<string, unknown> = {};
        if (mcpResult.contents && Array.isArray(mcpResult.contents)) {
          output.contents = mcpResult.contents.map((content) => ({
            uri: content.uri,
            mimeType: content.mimeType,
            text: content.text?.substring(0, 1000), // Limit text to 1000 chars
          }));
        }
        return output;
      } else if (method === "resources/list") {
        const output: Record<string, unknown> = { resources: [] };
        if (mcpResult.resources && Array.isArray(mcpResult.resources)) {
          output.resources = mcpResult.resources.map((resource) => ({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
          }));
        }
        return output;
      } else if (method === "prompts/get") {
        const output: Record<string, unknown> = {};
        if (mcpResult.messages && Array.isArray(mcpResult.messages)) {
          output.messages = mcpResult.messages.map((message) => ({
            role: message.role,
            content:
              typeof message.content === "string"
                ? message.content
                : JSON.stringify(message.content),
          }));
        }
        return output;
      } else if (method === "prompts/list") {
        const output: Record<string, unknown> = { prompts: [] };
        if (mcpResult.prompts && Array.isArray(mcpResult.prompts)) {
          output.prompts = mcpResult.prompts.map((prompt) => ({
            name: prompt.name,
            description: prompt.description,
          }));
        }
        return output;
      } else {
        // For other methods, try to serialize result cleanly
        const cleanResult: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(result)) {
          if (!key.startsWith("_")) {
            try {
              JSON.stringify(value);
              cleanResult[key] = value;
            } catch {
              cleanResult[key] = typeof value;
            }
          }
        }
        return cleanResult;
      }
    } catch (error: unknown) {
      this._diag.debug("Error extracting clean output:", error);
      this._config.exceptionLogger?.(error as Error);
      return {};
    }
  }

  private _shouldSendPrompts(): boolean {
    const contextShouldSendPrompts = context
      .active()
      .getValue(CONTEXT_KEY_ALLOW_TRACE_CONTENT);

    if (contextShouldSendPrompts !== undefined && contextShouldSendPrompts !== null) {
      return Boolean(contextShouldSendPrompts);
    }

    return this._config.traceContent !== undefined
      ? this._config.traceContent
      : true;
  }
}
