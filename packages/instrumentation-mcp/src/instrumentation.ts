import { InstrumentationBase, InstrumentationModuleDefinition, InstrumentationNodeModuleDefinition, safeExecuteInTheMiddle } from "@opentelemetry/instrumentation";
import { context, Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type * as sse from "@modelcontextprotocol/sdk/client/sse"
import type * as stdio from "@modelcontextprotocol/sdk/client/stdio"

import { McpInstrumentationConfig } from "./types";
import { version } from "../package.json"

export class McpInstrumentation extends InstrumentationBase {
    declare protected _config: McpInstrumentationConfig

    constructor(config: McpInstrumentationConfig = {}) {
        super("@modelcontextprotocol/sdk", version, config)
    }

    public override setConfig(config: McpInstrumentationConfig = {}) {  
        super.setConfig(config);
    }

    protected init(): InstrumentationModuleDefinition[]{

        return []
    }

    public manuallyInstrument(sseModule: typeof sse, stdioModule: typeof stdio) {
        this.wrapSSEClient(sseModule);
        this.wrapStdioClient(stdioModule);
    }

    private wrapSSEClient(module: typeof sse) {
        this._diag.debug(`Patching @modelcontextprotocol/sdk/client/sse`);
        
        // Store reference to the wrapper method
        const wrapperMethod = this.wrapperMethod();
        
        Object.defineProperty(module.SSEClientTransport.prototype, 'onmessage', {
            get(this: any) {
                return this._wrappedOnMessage || this._originalOnMessage;
            },
            set(this: any, newHandler: Function) {
                
                // Store the original handler
                this._originalOnMessage = newHandler;
                
                // Wrap the new handler if it's a function
                if (typeof newHandler === 'function') {
                    this._wrappedOnMessage = wrapperMethod(newHandler);
                } else {
                    this._wrappedOnMessage = newHandler;
                }
            },
            configurable: true,
            enumerable: true
        });

        // this._wrap(module.SSEClientTransport.prototype, "send", this.wrapperMethod());
        
    }

    private wrapStdioClient(module: typeof stdio) {
        this._diag.debug(`Patching @modelcontextprotocol/sdk/client/stdio`);
        
        // Store reference to the wrapper method
        const wrapperMethod = this.wrapperMethod();
        
        Object.defineProperty(module.StdioClientTransport.prototype, 'onmessage', {
            get(this: any) {
                return this._wrappedOnMessage || this._originalOnMessage;
            },
            set(this: any, newHandler: Function) {
                
                // Store the original handler
                this._originalOnMessage = newHandler;
                
                // Wrap the new handler if it's a function
                if (typeof newHandler === 'function') {
                    this._wrappedOnMessage = wrapperMethod(newHandler);
                } else {
                    this._wrappedOnMessage = newHandler;
                }
            },
            configurable: true,
            enumerable: true
        });

        // this._wrap(module.SSEClientTransport.prototype, "send", this.wrapperMethod());
        
    }



    private wrapperMethod() {
        const plugin = this;
        return (original: Function) => {
          return function method(this: any, ...args: any) {
            const span = plugin._startSpan({
              params: args[0],
            });
            const execContext = trace.setSpan(context.active(), span);
            const execPromise = safeExecuteInTheMiddle(
              () => {
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

    private _startSpan(params: any) {
        const attributes = {
            "mcp.request.id": params.params.id,
            "mcp.response.value": JSON.stringify(params.result || params.params?.content || params.params?.data),
            "mcp.method.name": params.params.method,
        }
        return this.tracer.startSpan("mcp.client.response", {
            kind: SpanKind.CLIENT,
            attributes
        });
    }

    private async _wrapPromise<T>(span: Span, promise: Promise<T>): Promise<T> {
        try {
            const result = await promise;
            this._endSpan(span);
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
    
    private _endSpan(span: Span) {
        span.end();
    }
}