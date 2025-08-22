# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenLLMetry-JS is a JavaScript/TypeScript observability framework for LLM applications, built on OpenTelemetry. It provides instrumentation for major LLM providers (OpenAI, Anthropic, etc.) and vector databases, with a unified SDK for easy integration.

## Development Commands

### Building

```bash
# Build all packages
pnpm nx run-many -t build
# or
pnpm nx run-many --targets=build

# Build affected packages only
pnpm nx affected -t build
```

### Testing

Each package has its own test command:

```bash
# Test individual packages
cd packages/traceloop-sdk
pnpm test

# Test specific instrumentation
cd packages/instrumentation-openai
pnpm test
```

You can also use nx to run tests:

```bash
# Test all packages
pnpm nx run-many -t test

# Test specific package by name
pnpm nx test @traceloop/node-server-sdk

# Test only affected packages
pnpm nx affected -t test

# Test with specific pattern
pnpm nx run-many -t test --projects="*instrumentation*"

# Run tests in parallel
pnpm nx run-many -t test --parallel

# Watch mode for development
pnpm nx test @traceloop/node-server-sdk --watch
```

### Linting

```bash
# Lint individual packages
cd packages/[package-name]
pnpm lint

# Fix lint issues
pnpm lint:fix
```

## Architecture

### Monorepo Structure

- **Lerna + Nx**: Manages multiple packages with shared tooling
- **packages/**: Contains all publishable packages and internal tooling
- **Rollup**: Used for building packages with TypeScript compilation

### Core Packages

#### `traceloop-sdk` (Main SDK)

- **Path**: `packages/traceloop-sdk/`
- **Exports**: `@traceloop/node-server-sdk`
- **Purpose**: Primary entry point that orchestrates all instrumentations
- **Key Files**:
  - `src/lib/tracing/decorators.ts`: Workflow and task decorators (`@workflow`, `@task`, `@agent`)
  - `src/lib/tracing/tracing.ts`: Core tracing utilities and span management
  - `src/lib/node-server-sdk.ts`: Main initialization logic

#### Instrumentation Packages

Each follows the pattern: `packages/instrumentation-[provider]/`

- **OpenAI**: `@traceloop/instrumentation-openai`
- **Anthropic**: `@traceloop/instrumentation-anthropic`
- **Bedrock**: `@traceloop/instrumentation-bedrock`
- **Vector DBs**: Pinecone, Chroma, Qdrant packages
- **Frameworks**: LangChain, LlamaIndex packages

#### `ai-semantic-conventions`

- **Path**: `packages/ai-semantic-conventions/`
- **Purpose**: OpenTelemetry semantic conventions for AI/LLM spans
- **Key File**: `src/SemanticAttributes.ts` - defines all span attribute constants

### Instrumentation Pattern

All instrumentations extend `InstrumentationBase` from `@opentelemetry/instrumentation`:

1. **Hook Registration**: Wrap target library functions using `InstrumentationModuleDefinition`
2. **Span Creation**: Create spans with appropriate semantic attributes
3. **Data Extraction**: Extract request/response data and token usage
4. **Error Handling**: Capture and record errors appropriately

### Testing Strategy

- **Polly.js**: Records HTTP interactions for consistent test execution
- **ts-mocha**: TypeScript test runner
- **Recordings**: Stored in `recordings/` folders for replay testing

## Key Patterns

### Workspace Dependencies

Packages reference each other using `workspace:*` in package.json, managed by pnpm workspaces.

### Decorator Usage

```typescript
// Workflow spans
@workflow("my-workflow")
async function myWorkflow() { }

// Task spans
@task("my-task")
async function myTask() { }
```

### Manual Instrumentation

```typescript
import { trace } from "@traceloop/node-server-sdk";
const span = trace.withLLMSpan("my-llm-call", () => {
  // LLM operations
});
```

### Telemetry Configuration

- Anonymous telemetry enabled by default
- Opt-out via `TRACELOOP_TELEMETRY=FALSE` environment variable
- Only collected in SDK, not individual instrumentations

## Common Development Tasks

### Adding New LLM Provider

1. Create new instrumentation package in `packages/instrumentation-[provider]/`
2. Implement instrumentation extending `InstrumentationBase`
3. Add to main SDK dependencies in `packages/traceloop-sdk/package.json`
4. Register in SDK initialization

### Running Single Test

```bash
cd packages/[package-name]
pnpm test -- --grep "test name pattern"
```

### Debugging Instrumentations

Enable OpenTelemetry debug logging:

```bash
export OTEL_LOG_LEVEL=debug
```
