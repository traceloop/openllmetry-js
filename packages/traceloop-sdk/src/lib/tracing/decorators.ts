import { Span, context } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import {
  ASSOCATION_PROPERTIES_KEY,
  ENTITY_NAME_KEY,
  getEntityPath,
  getTracer,
  WORKFLOW_NAME_KEY,
} from "./tracing";
import {
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
  SpanAttributes,
  TraceloopSpanKindValues,
} from "@traceloop/ai-semantic-conventions";
import { shouldSendTraces } from ".";
import { Telemetry } from "../telemetry/telemetry";

export type DecoratorConfig = {
  name: string;
  version?: number;
  associationProperties?: { [name: string]: string };
  traceContent?: boolean;
  inputParameters?: unknown[];
  suppressTracing?: boolean;
};

function withEntity<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(
  type: TraceloopSpanKindValues,
  {
    name,
    version,
    associationProperties,
    traceContent: overrideTraceContent,
    inputParameters,
    suppressTracing: shouldSuppressTracing,
  }: DecoratorConfig,
  fn: F,
  thisArg?: ThisParameterType<F>,
  ...args: A
) {
  let entityContext = context.active();
  if (
    type === TraceloopSpanKindValues.WORKFLOW ||
    type === TraceloopSpanKindValues.AGENT
  ) {
    entityContext = entityContext.setValue(WORKFLOW_NAME_KEY, name);
  }

  const entityPath = getEntityPath(entityContext);
  if (
    type === TraceloopSpanKindValues.TOOL ||
    type === TraceloopSpanKindValues.TASK
  ) {
    const fullEntityName = entityPath ? `${entityPath}.${name}` : name;
    entityContext = entityContext.setValue(ENTITY_NAME_KEY, fullEntityName);
  }

  if (overrideTraceContent != undefined) {
    entityContext = entityContext.setValue(
      CONTEXT_KEY_ALLOW_TRACE_CONTENT,
      overrideTraceContent,
    );
  }
  if (associationProperties) {
    entityContext = entityContext.setValue(
      ASSOCATION_PROPERTIES_KEY,
      associationProperties,
    );
  }

  if (shouldSuppressTracing) {
    entityContext = suppressTracing(entityContext);
  }

  return context.with(entityContext, () =>
    getTracer().startActiveSpan(
      `${name}.${type}`,
      {},
      entityContext,
      async (span: Span) => {
        if (
          type === TraceloopSpanKindValues.WORKFLOW ||
          type === TraceloopSpanKindValues.AGENT
        ) {
          span.setAttribute(SpanAttributes.TRACELOOP_WORKFLOW_NAME, name);
        }
        span.setAttribute(SpanAttributes.TRACELOOP_ENTITY_NAME, name);
        span.setAttribute(
          SpanAttributes.TRACELOOP_ENTITY_PATH,
          entityPath || "",
        );
        span.setAttribute(SpanAttributes.TRACELOOP_SPAN_KIND, type);

        if (version) {
          span.setAttribute(SpanAttributes.TRACELOOP_ENTITY_VERSION, version);
        }

        if (shouldSendTraces()) {
          try {
            const input = inputParameters ?? args;
            if (
              input.length === 1 &&
              typeof input[0] === "object" &&
              !(input[0] instanceof Map)
            ) {
              span.setAttribute(
                SpanAttributes.TRACELOOP_ENTITY_INPUT,
                serialize({ args: [], kwargs: input[0] }),
              );
            } else {
              span.setAttribute(
                SpanAttributes.TRACELOOP_ENTITY_INPUT,
                serialize({
                  args: input,
                  kwargs: {},
                }),
              );
            }
          } catch (error) {
            Telemetry.getInstance().logException(error);
          }
        }

        const res = fn.apply(thisArg, args);
        if (res instanceof Promise) {
          return res.then((resolvedRes) => {
            try {
              if (shouldSendTraces()) {
                span.setAttribute(
                  SpanAttributes.TRACELOOP_ENTITY_OUTPUT,
                  serialize(resolvedRes),
                );
              }
            } catch (error) {
              Telemetry.getInstance().logException(error);
            } finally {
              span.end();
            }

            return resolvedRes;
          });
        }
        try {
          if (shouldSendTraces()) {
            span.setAttribute(
              SpanAttributes.TRACELOOP_ENTITY_OUTPUT,
              serialize(res),
            );
          }
        } catch (error) {
          Telemetry.getInstance().logException(error);
        } finally {
          span.end();
        }

        return res;
      },
    ),
  );
}

export function withWorkflow<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(config: DecoratorConfig, fn: F, ...args: A) {
  return withEntity(
    TraceloopSpanKindValues.WORKFLOW,
    config,
    fn,
    undefined,
    ...args,
  );
}

export function withTask<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(config: DecoratorConfig, fn: F, ...args: A) {
  return withEntity(
    TraceloopSpanKindValues.TASK,
    config,
    fn,
    undefined,
    ...args,
  );
}

export function withAgent<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(config: DecoratorConfig, fn: F, ...args: A) {
  return withEntity(
    TraceloopSpanKindValues.AGENT,
    config,
    fn,
    undefined,
    ...args,
  );
}

export function withTool<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(config: DecoratorConfig, fn: F, ...args: A) {
  return withEntity(
    TraceloopSpanKindValues.TOOL,
    config,
    fn,
    undefined,
    ...args,
  );
}

function entity(
  type: TraceloopSpanKindValues,
  config:
    | Partial<DecoratorConfig>
    | ((thisArg: unknown, ...funcArgs: unknown[]) => Partial<DecoratorConfig>),
) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: unknown[]) {
      let actualConfig;

      if (typeof config === "function") {
        actualConfig = config(this, ...args);
      } else {
        actualConfig = config;
      }

      const entityName = actualConfig.name ?? originalMethod.name;

      return withEntity(
        type,
        { ...actualConfig, name: entityName },
        originalMethod,
        this,
        ...args,
      );
    };
  };
}

export function workflow(
  config:
    | Partial<DecoratorConfig>
    | ((thisArg: unknown, ...funcArgs: unknown[]) => Partial<DecoratorConfig>),
) {
  return entity(TraceloopSpanKindValues.WORKFLOW, config ?? {});
}

export function task(
  config:
    | Partial<DecoratorConfig>
    | ((thisArg: unknown, ...funcArgs: unknown[]) => Partial<DecoratorConfig>),
) {
  return entity(TraceloopSpanKindValues.TASK, config ?? {});
}

export function agent(
  config:
    | Partial<DecoratorConfig>
    | ((thisArg: unknown, ...funcArgs: unknown[]) => Partial<DecoratorConfig>),
) {
  return entity(TraceloopSpanKindValues.AGENT, config ?? {});
}

export function tool(
  config:
    | Partial<DecoratorConfig>
    | ((thisArg: unknown, ...funcArgs: unknown[]) => Partial<DecoratorConfig>),
) {
  return entity(TraceloopSpanKindValues.TOOL, config ?? {});
}

function cleanInput(input: unknown): unknown {
  if (input instanceof Map) {
    return Array.from(input.entries());
  } else if (Array.isArray(input)) {
    return input.map((value) => cleanInput(value));
  } else if (!input) {
    return input;
  } else if (typeof input === "object") {
    // serialize object one by one
    const output: any = {};
    Object.entries(input as any).forEach(([key, value]) => {
      output[key] = cleanInput(value);
    });
    return output;
  }

  return input;
}

function serialize(input: unknown): string {
  return JSON.stringify(cleanInput(input));
}
