# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenLLMetry-JS is a JavaScript/TypeScript observability framework for LLM applications, built on OpenTelemetry. It provides instrumentation for major LLM providers and vector databases, with a unified SDK for easy integration.

- **Node version**: v20 (pinned via `.nvmrc`)
- **Package manager**: pnpm (v10)

## Development Commands

### Building

```bash
# Build all packages
pnpm nx run-many -t build

# Build affected packages only
pnpm nx affected -t build
```

### Testing

```bash
# Test individual packages
cd packages/instrumentation-openai
pnpm test

# Test all packages via nx
pnpm nx run-many -t test

# Test specific package by name
pnpm nx test @traceloop/node-server-sdk

# Test only affected packages
pnpm nx affected -t test

# Test with specific pattern
pnpm nx run-many -t test --projects="*instrumentation*"

# Run tests in parallel
pnpm nx run-many -t test --parallel
```

**Test infrastructure notes:**
- Tests use **Polly.js** to record/replay HTTP interactions (HAR files in `recordings/` dirs)
- Set `RECORD_MODE=NEW` to record new Polly.js fixtures against real APIs
- Test runner is **ts-mocha** with per-package `tsconfig.test.json`
- Timeouts vary per package (e.g., OpenAI: 40s, Bedrock/ChromaDB: 20s)
- CI spins up **Qdrant** (port 6333) and **Chroma** (port 8000) service containers for integration tests
- Test directory naming is inconsistent: some packages use `test/`, others use `tests/`

### Linting & Formatting

```bash
# Lint individual packages
cd packages/[package-name]
pnpm lint
pnpm lint:fix

# Check formatting (also runs in CI)
pnpm prettier --check .

# Fix formatting
pnpm prettier --write .
```

- **ESLint**: Flat config (`eslint.config.cjs`) with `@nx/enforce-module-boundaries`
- **Prettier**: Double quotes (`.prettierrc`)
- **Conventional commits** enforced via Husky + CommitLint (`@commitlint/config-conventional`)

## Architecture

### Monorepo Structure

- **Lerna + Nx**: Lerna for versioning/publishing, Nx for task orchestration and caching
- **pnpm workspaces**: Manages inter-package dependencies (`workspace:*` protocol)
- **Rollup**: Builds most packages (CJS + ESM + `.d.ts` outputs with sourcemaps)
- **Cacheable operations** (nx.json): `build`, `lint`, `test`, `e2e`
- **Task dependencies**: `build` depends on `^build` (upstream first); `test` depends on `^build`

### Core Packages

#### `traceloop-sdk` (Main SDK)

- **Path**: `packages/traceloop-sdk/`
- **Exports**: `@traceloop/node-server-sdk`
- **Purpose**: Primary entry point that orchestrates all instrumentations
- **Key Files**:
  - `src/lib/node-server-sdk.ts`: Main initialization logic
  - `src/lib/tracing/decorators.ts`: Workflow and task decorators (`@workflow`, `@task`, `@agent`)
  - `src/lib/tracing/index.ts`: Core tracing utilities and span management
  - `src/lib/tracing/span-processor.ts`: Custom span processing
  - `src/lib/tracing/sampler.ts`: Sampling configuration
  - `src/lib/tracing/ai-sdk-transformations.ts`: AI SDK data transformations
  - `src/lib/tracing/baggage-utils.ts`: Baggage propagation helpers

#### Instrumentation Packages

Each follows the pattern: `packages/instrumentation-[provider]/`

**LLM Providers:**
- **OpenAI**: `@traceloop/instrumentation-openai`
- **Anthropic**: `@traceloop/instrumentation-anthropic`
- **Bedrock**: `@traceloop/instrumentation-bedrock`
- **Cohere**: `@traceloop/instrumentation-cohere`
- **Together**: `@traceloop/instrumentation-together`
- **VertexAI**: `@traceloop/instrumentation-vertexai`

**Vector Databases:**
- **Pinecone**: `@traceloop/instrumentation-pinecone`
- **ChromaDB**: `@traceloop/instrumentation-chromadb`
- **Qdrant**: `@traceloop/instrumentation-qdrant`

**Frameworks & Protocols:**
- **LangChain**: `@traceloop/instrumentation-langchain`
- **LlamaIndex**: `@traceloop/instrumentation-llamaindex`
- **MCP**: `@traceloop/instrumentation-mcp`

#### `ai-semantic-conventions`

- **Path**: `packages/ai-semantic-conventions/`
- **Purpose**: OpenTelemetry semantic conventions for AI/LLM spans
- **Build**: Uses `tsc --build` (not Rollup — the exception to the pattern)
- **Key Files**:
  - `src/SemanticAttributes.ts`: Defines all span attribute constants
  - `src/message-formatters.ts`: Message formatting utilities
  - `src/semantic-conventions-migration-helper.ts`: Helpers for migrating to newer OTel semantic conventions

### Instrumentation Pattern

All instrumentations extend `InstrumentationBase` from `@opentelemetry/instrumentation`:

1. **Hook Registration**: Wrap target library functions using `InstrumentationModuleDefinition`
2. **Span Creation**: Create spans with appropriate semantic attributes
3. **Data Extraction**: Extract request/response data and token usage
4. **Error Handling**: Capture and record errors appropriately

Standard package structure:
```
instrumentation-[provider]/
├── src/
│   ├── index.ts              # Exports instrumentation and types
│   ├── instrumentation.ts    # Main instrumentation class
│   └── types.ts              # TypeScript interfaces/configs
├── test/ (or tests/)
│   ├── instrumentation.test.ts
│   └── recordings/           # Polly.js HAR recordings
├── package.json
├── tsconfig.json
├── tsconfig.test.json
├── rollup.config.js
└── eslint.config.cjs
```

## CI/CD

### GitHub Actions

- **`ci.yml`**: Runs on PRs and pushes to `main`
  - **Lint job**: ESLint + Prettier check
  - **Build & Test job**: `pnpm nx affected --target=build --parallel=3` then `pnpm nx affected --target=test --parallel=3 --ci --code-coverage`
  - Spins up Qdrant and Chroma service containers for integration tests

- **`release.yml`**: Manual workflow dispatch
  - Builds all packages, then runs `pnpm lerna version --conventional-commits` for semantic versioning
  - Publishes to npm via `pnpm lerna publish from-git`
  - Creates GitHub release with CHANGELOG body

- **`release-otel-v1.yml`**: Manual dispatch for OTel v1 compatible releases
  - Appends `-otel-v1` suffix, publishes with `--dist-tag otel-v1`

### Dependency Management

- **Dependabot**: Weekly updates configured for 11 package directories with auto-labeling
- **pnpm overrides**: Security patches for transitive dependencies (defined in root `package.json` and `pnpm-workspace.yaml`)

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

## Common Development Tasks

### Adding New LLM Provider

No scaffolding tool exists — copy an existing instrumentation package and adapt:

1. Copy a similar instrumentation package to `packages/instrumentation-[provider]/`
2. Update `package.json` (name, dependencies for the provider SDK)
3. Implement instrumentation extending `InstrumentationBase` in `src/instrumentation.ts`
4. Follow the rollup.config.js / tsconfig.json / tsconfig.test.json pattern from the copied package
5. Add `@traceloop/instrumentation-[provider]: workspace:*` to `packages/traceloop-sdk/package.json`
6. Register in SDK initialization (`packages/traceloop-sdk/src/lib/node-server-sdk.ts`)

### Code Generation

```bash
# Generate TypeScript models from OpenAPI specs (for evaluator models)
pnpm run generate:evaluator-models
# Outputs to packages/traceloop-sdk/src/lib/generated/evaluators/
```

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