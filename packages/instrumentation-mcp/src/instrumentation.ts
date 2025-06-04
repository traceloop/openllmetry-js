import {
  InstrumentationBase,
  safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
import {
  context,
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import type * as sse from "@modelcontextprotocol/sdk/client/sse";
import type * as stdio from "@modelcontextprotocol/sdk/client/stdio.js";

import { McpInstrumentationConfig } from "./types";
import { version } from "../package.json";

export class McpInstrumentation extends InstrumentationBase {
  declare protected _config: McpInstrumentationConfig;

  constructor(config: McpInstrumentationConfig = {}) {
    super("@modelcontextprotocol/sdk", version, config);
  }

  public override setConfig(config: McpInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  // auto-instrumentation doesn't work for the modules we're instrumenting
  protected init() {}

  public manuallyInstrument({
    sseModule,
    stdioModule,
  }: {
    sseModule?: typeof sse;
    stdioModule?: typeof stdio;
  }) {
    if (sseModule) {
      this.wrapSSEClient(sseModule);
    }
    if (stdioModule) {
      this.wrapStdioClient(stdioModule);
    }
  }

  private wrapSSEClient(module: typeof sse) {
    this._diag.debug(`Patching @modelcontextprotocol/sdk/client/sse`);

    // Store reference to the wrapper method
    const onMessageWrapper = this.onMessageWrapper();

    Object.defineProperty(module.SSEClientTransport.prototype, "onmessage", {
      get(this: any) {
        return this._wrappedOnMessage || this._originalOnMessage;
      },
      set(this: any, newHandler: Function) {
        // Store the original handler
        this._originalOnMessage = newHandler;

        // Wrap the new handler if it's a function
        if (typeof newHandler === "function") {
          this._wrappedOnMessage = onMessageWrapper(newHandler);
        } else {
          this._wrappedOnMessage = newHandler;
        }
      },
      configurable: true,
      enumerable: true,
    });

    this._wrap(
      module.SSEClientTransport.prototype,
      "send",
      this.onSendWrapper(),
    );
  }

  private wrapStdioClient(module: typeof stdio) {
    this._diag.debug(`Patching @modelcontextprotocol/sdk/client/stdio`);

    // Store reference to the wrapper method
    const onMessageWrapper = this.onMessageWrapper();

    Object.defineProperty(module.StdioClientTransport.prototype, "onmessage", {
      get(this: any) {
        return this._wrappedOnMessage || this._originalOnMessage;
      },
      set(this: any, newHandler: Function) {
        // Store the original handler
        this._originalOnMessage = newHandler;

        // Wrap the new handler if it's a function
        if (typeof newHandler === "function") {
          this._wrappedOnMessage = onMessageWrapper(newHandler);
        } else {
          this._wrappedOnMessage = newHandler;
        }
      },
      configurable: true,
      enumerable: true,
    });

    this._wrap(
      module.StdioClientTransport.prototype,
      "send",
      this.onSendWrapper(),
    );
  }

  private onMessageWrapper() {
    const plugin = this;
    return (original: Function) => {
      return function method(this: any, ...args: any) {
        const span = plugin._startSpan(args[0], "response");
        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          (): Promise<void> => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          (e) => {
            if (e) {
              plugin._diag.error(`Error in mcp instrumentation`, e);
            }
          },
        );
        const wrappedPromise = plugin._wrapPromise(span, execPromise);
        return context.bind(execContext, wrappedPromise);
      };
    };
  }

  private onSendWrapper() {
    const plugin = this;
    return (original: Function) => {
      return function method(this: any, ...args: any) {
        const span = plugin._startSpan(args[0], "request");
        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          (): Promise<void> => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          (e) => {
            if (e) {
              plugin._diag.error(`Error in mcp instrumentation`, e);
            }
          },
        );
        const wrappedPromise = plugin._wrapPromise(span, execPromise);
        return context.bind(execContext, wrappedPromise);
      };
    };
  }

  private _startSpan(params: any, type: "request" | "response") {
    let attributes;
    if (type === "response") {
      attributes = {
        "mcp.response.id": params.params?.id,
        "mcp.response.value": JSON.stringify(
          params.result || params.params?.content || params.params?.data,
        ),
        "mcp.method.name": params.params?.method,
      };
    } else {
      attributes = {
        "mcp.request.id": params.id || params.params?.requestId,
        "mcp.request.method": params.method,
        "mcp.request.params": JSON.stringify(params.params),
      };
    }
    return this.tracer.startSpan("mcp.client.response", {
      kind: SpanKind.CLIENT,
      attributes,
    });
  }

  private async _wrapPromise<T>(span: Span, promise: Promise<T>): Promise<T> {
    try {
      const result = await promise;
      span.end();
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.setAttributes({
        "mcp.error.message": error.message,
      });
      span.recordException(error);
      span.end();
      throw error;
    }
  }
}
