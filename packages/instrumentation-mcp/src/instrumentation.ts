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
  context,
  trace,
  Span,
  SpanStatusCode,
  SpanKind,
} from "@opentelemetry/api";
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

// Symbol to store session context on client/server instances
const SESSION_CONTEXT_SYMBOL = Symbol("mcp-session-context");
const SESSION_SPAN_SYMBOL = Symbol("mcp-session-span");

export class McpInstrumentation extends InstrumentationBase {
  declare protected _config: McpInstrumentationConfig;

  constructor(config: McpInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-mcp", version, config);
  }

  public override setConfig(config: McpInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition[] {
    // The MCP SDK exports Client and Server from subpaths.
    // We need to hook both the bare subpath and the /index.js variant
    // because different import styles resolve to different module specifiers.
    const clientModule = new InstrumentationNodeModuleDefinition(
      "@modelcontextprotocol/sdk/client",
      [">=1.0.0"],
      this.patchClient.bind(this),
      this.unpatchClient.bind(this),
    );

    const clientIndexModule = new InstrumentationNodeModuleDefinition(
      "@modelcontextprotocol/sdk/client/index.js",
      [">=1.0.0"],
      this.patchClient.bind(this),
      this.unpatchClient.bind(this),
    );

    const serverModule = new InstrumentationNodeModuleDefinition(
      "@modelcontextprotocol/sdk/server",
      [">=1.0.0"],
      this.patchServer.bind(this),
      this.unpatchServer.bind(this),
    );

    const serverIndexModule = new InstrumentationNodeModuleDefinition(
      "@modelcontextprotocol/sdk/server/index.js",
      [">=1.0.0"],
      this.patchServer.bind(this),
      this.unpatchServer.bind(this),
    );

    return [clientModule, clientIndexModule, serverModule, serverIndexModule];
  }

  /**
   * Manually instrument an MCP SDK module (Client or Server).
   * This is useful for ESM modules where automatic instrumentation may not work.
   *
   * @example
   * ```typescript
   * import * as traceloop from "@traceloop/node-server-sdk";
   * import { Client } from "@modelcontextprotocol/sdk/client/index.js";
   *
   * traceloop.initialize({ appName: "my-app" });
   *
   * // Get the MCP instrumentation instance and manually instrument
   * const mcpInstrumentation = traceloop.getMCPInstrumentation();
   * mcpInstrumentation?.manuallyInstrument({ Client });
   *
   * // Now Client will be traced
   * const client = new Client(...);
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public manuallyInstrument(module: any) {
    this._diag.debug("Manually instrumenting MCP SDK");

    // Check if the module has Client class
    if (module.Client) {
      this._diag.debug("Wrapping MCP Client methods");
      this._wrap(
        module.Client.prototype,
        "connect",
        this._wrapConnect.bind(this),
      );
      this._wrap(
        module.Client.prototype,
        "request",
        this._wrapRequest.bind(this, "client"),
      );
      this._wrap(
        module.Client.prototype,
        "close",
        this._wrapClose.bind(this),
      );
    }

    // Check if the module has Server class
    if (module.Server) {
      this._diag.debug("Wrapping MCP Server methods");
      this._wrap(
        module.Server.prototype,
        "request",
        this._wrapRequest.bind(this, "server"),
      );
    }

    if (!module.Client && !module.Server) {
      this._diag.warn(
        "manuallyInstrument called but no Client or Server found in provided module",
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private patchClient(moduleExports: any, moduleVersion?: string) {
    this._diag.debug(`Patching @modelcontextprotocol/sdk/client@${moduleVersion}`);

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
      this._wrap(
        moduleExports.Client.prototype,
        "close",
        this._wrapClose.bind(this),
      );
    }

    return moduleExports;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private unpatchClient(moduleExports: any, moduleVersion?: string): void {
    this._diag.debug(`Unpatching @modelcontextprotocol/sdk/client@${moduleVersion}`);

    if (moduleExports.Client) {
      this._unwrap(moduleExports.Client.prototype, "connect");
      this._unwrap(moduleExports.Client.prototype, "request");
      this._unwrap(moduleExports.Client.prototype, "close");
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private patchServer(moduleExports: any, moduleVersion?: string) {
    this._diag.debug(`Patching @modelcontextprotocol/sdk/server@${moduleVersion}`);

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
  private unpatchServer(moduleExports: any, moduleVersion?: string): void {
    this._diag.debug(`Unpatching @modelcontextprotocol/sdk/server@${moduleVersion}`);

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

      span.setAttribute(
        SpanAttributes.TRACELOOP_SPAN_KIND,
        TraceloopSpanKindValues.SESSION,
      );
      span.setAttribute(
        SpanAttributes.TRACELOOP_ENTITY_NAME,
        "mcp.client.session",
      );

      // Add client/server name as workflow name
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clientInfo = (this as any)._clientInfo;
      if (clientInfo && clientInfo.name) {
        span.setAttribute(
          SpanAttributes.TRACELOOP_WORKFLOW_NAME,
          `${clientInfo.name}.mcp`,
        );
      }

      // Create a context with this session span
      const sessionContext = trace.setSpan(context.active(), span);

      // Store the session context and span on the instance for later use
      this[SESSION_CONTEXT_SYMBOL] = sessionContext;
      this[SESSION_SPAN_SYMBOL] = span;

      try {
        const result = original.apply(this, args);

        // Handle promise
        if (result && typeof result.then === "function") {
          return result
            .then((value: unknown) => {
              // Don't end the span here - it should stay open for the session
              span.setStatus({ code: SpanStatusCode.OK });
              return value;
            })
            .catch((error: Error) => {
              // On connection error, end the span
              span.recordException(error);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
              });
              span.end();
              // Clean up stored references
              delete this[SESSION_CONTEXT_SYMBOL];
              delete this[SESSION_SPAN_SYMBOL];
              throw error;
            });
        }

        // Sync result - don't end the span
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error: unknown) {
        // On connection error, end the span
        const err = error as Error;
        span.recordException(err);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err?.message || String(error),
        });
        span.end();
        // Clean up stored references
        delete this[SESSION_CONTEXT_SYMBOL];
        delete this[SESSION_SPAN_SYMBOL];
        throw error;
      }
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
        spanKind = TraceloopSpanKindValues.UNKNOWN;
      }

      // Use the stored session context as parent if available
      const sessionContext = this[SESSION_CONTEXT_SYMBOL];
      const parentContext = sessionContext || context.active();

      const span = plugin.tracer.startSpan(
        spanName,
        {
          kind: side === "client" ? SpanKind.CLIENT : SpanKind.SERVER,
        },
        parentContext,
      );

      span.setAttribute(SpanAttributes.TRACELOOP_SPAN_KIND, spanKind);
      span.setAttribute(SpanAttributes.TRACELOOP_ENTITY_NAME, entityName);

      // Add workflow name from client/server info (similar to Python implementation)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clientInfo = (this as any)._clientInfo;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serverInfo = (this as any).server?._serverInfo;

      const info = clientInfo || serverInfo;
      if (info && info.name) {
        span.setAttribute(
          SpanAttributes.TRACELOOP_WORKFLOW_NAME,
          `${info.name}.mcp`,
        );
      }

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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private _wrapClose(original: Function) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function (this: any, ...args: unknown[]) {
      const sessionSpan = this[SESSION_SPAN_SYMBOL];

      try {
        const result = original.apply(this, args);

        // Handle promise
        if (result && typeof result.then === "function") {
          return result
            .then((value: unknown) => {
              // End the session span on successful close
              if (sessionSpan) {
                sessionSpan.setStatus({ code: SpanStatusCode.OK });
                sessionSpan.end();
                delete this[SESSION_CONTEXT_SYMBOL];
                delete this[SESSION_SPAN_SYMBOL];
              }
              return value;
            })
            .catch((error: Error) => {
              // End the session span with error on close failure
              if (sessionSpan) {
                sessionSpan.recordException(error);
                sessionSpan.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                sessionSpan.end();
                delete this[SESSION_CONTEXT_SYMBOL];
                delete this[SESSION_SPAN_SYMBOL];
              }
              throw error;
            });
        }

        // Sync result - end the session span
        if (sessionSpan) {
          sessionSpan.setStatus({ code: SpanStatusCode.OK });
          sessionSpan.end();
          delete this[SESSION_CONTEXT_SYMBOL];
          delete this[SESSION_SPAN_SYMBOL];
        }
        return result;
      } catch (error: unknown) {
        // End the session span with error
        if (sessionSpan) {
          const err = error as Error;
          sessionSpan.recordException(err);
          sessionSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err?.message || String(error),
          });
          sessionSpan.end();
          delete this[SESSION_CONTEXT_SYMBOL];
          delete this[SESSION_SPAN_SYMBOL];
        }
        throw error;
      }
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
          const errorMessage = mcpResult.content?.[0]?.text || "Unknown error";
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
      if (
        method === "tools/call" &&
        typeof params === "object" &&
        params !== null
      ) {
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
            name:
              "name" in params ? (params as { name: unknown }).name : undefined,
            arguments:
              "arguments" in params
                ? (params as { arguments: unknown }).arguments
                : undefined,
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

        if (
          mcpResult.content &&
          Array.isArray(mcpResult.content) &&
          mcpResult.content.length > 0
        ) {
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

    if (
      contextShouldSendPrompts !== undefined &&
      contextShouldSendPrompts !== null
    ) {
      return Boolean(contextShouldSendPrompts);
    }

    return this._config.traceContent !== undefined
      ? this._config.traceContent
      : true;
  }
}
