# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.22.2](https://github.com/traceloop/openllmetry-js/compare/v0.22.1...v0.22.2) (2025-12-02)

### Bug Fixes

- **ai-sdk:** report cached tokens usage ([#839](https://github.com/traceloop/openllmetry-js/issues/839)) ([546092d](https://github.com/traceloop/openllmetry-js/commit/546092dcf2dcbee6c0240bd6e005d1547cb9ef26))

# [0.22.0](https://github.com/traceloop/openllmetry-js/compare/v0.21.1...v0.22.0) (2025-11-27)

### Bug Fixes

- transform Vercel AI SDK token attributes to use input_tokens/output_tokens ([1a416a0](https://github.com/traceloop/openllmetry-js/commit/1a416a0debe3673140c8bed54d6eb23cb20f3f8d))

### Features

- use official OpenTelemetry incubating semantic conventions for token attributes ([00e2529](https://github.com/traceloop/openllmetry-js/commit/00e25296877503ff189a76b384aa3d143b1339f7))

# [0.21.0](https://github.com/traceloop/openllmetry-js/compare/v0.20.2...v0.21.0) (2025-11-24)

### Features

- **mcp:** add mcp official sdk instrumentation ([#829](https://github.com/traceloop/openllmetry-js/issues/829)) ([3d7b845](https://github.com/traceloop/openllmetry-js/commit/3d7b84509dfcd51116024a243c62e2100083be93))

# [0.20.0](https://github.com/traceloop/openllmetry-js/compare/v0.19.1...v0.20.0) (2025-11-04)

### Bug Fixes

- **agent:** Add gen_ai.agent.name span attribute ([#737](https://github.com/traceloop/openllmetry-js/issues/737)) ([b2af9a2](https://github.com/traceloop/openllmetry-js/commit/b2af9a2635624a6e30a271e3d457039166147dda))

# [0.19.0](https://github.com/traceloop/openllmetry-js/compare/v0.18.1...v0.19.0) (2025-09-17)

### Features

- **vercel:** add gen.ai.input.messages + gen.ai.output.messages ([#734](https://github.com/traceloop/openllmetry-js/issues/734)) ([4d9f995](https://github.com/traceloop/openllmetry-js/commit/4d9f995df1435f31554ee92024f398d11c3e8ad6))

# [0.18.0](https://github.com/traceloop/openllmetry-js/compare/v0.17.1...v0.18.0) (2025-08-24)

**Note:** Version bump only for package @traceloop/ai-semantic-conventions

# [0.17.0](https://github.com/traceloop/openllmetry-js/compare/v0.16.2...v0.17.0) (2025-08-18)

**Note:** Version bump only for package @traceloop/ai-semantic-conventions

# [0.16.0](https://github.com/traceloop/openllmetry-js/compare/v0.15.0...v0.16.0) (2025-08-14)

**Note:** Version bump only for package @traceloop/ai-semantic-conventions

# [0.15.0](https://github.com/traceloop/openllmetry-js/compare/v0.14.6...v0.15.0) (2025-08-11)

**Note:** Version bump only for package @traceloop/ai-semantic-conventions

# [0.14.0](https://github.com/traceloop/openllmetry-js/compare/v0.13.5...v0.14.0) (2025-07-04)

**Note:** Version bump only for package @traceloop/ai-semantic-conventions

# [0.13.0](https://github.com/traceloop/openllmetry-js/compare/v0.12.2...v0.13.0) (2025-04-22)

**Note:** Version bump only for package @traceloop/ai-semantic-conventions

# [0.12.0](https://github.com/traceloop/openllmetry-js/compare/v0.11.7...v0.12.0) (2025-01-13)

**Note:** Version bump only for package @traceloop/ai-semantic-conventions

## [0.11.6](https://github.com/traceloop/openllmetry-js/compare/v0.11.5...v0.11.6) (2024-12-16)

### Bug Fixes

- **deps:** major, minor and various instrumentation fixes ([0f18865](https://github.com/traceloop/openllmetry-js/commit/0f18865c4270c918f6c0b1bec701dc947353a213))

# [0.11.0](https://github.com/traceloop/openllmetry-js/compare/v0.10.0...v0.11.0) (2024-08-27)

**Note:** Version bump only for package @traceloop/ai-semantic-conventions

# [0.10.0](https://github.com/traceloop/openllmetry-js/compare/v0.9.5...v0.10.0) (2024-08-01)

### Features

- introduce traceloop.entity.path instead of traceloop.entity.name chaining ([#393](https://github.com/traceloop/openllmetry-js/issues/393)) ([207f9fe](https://github.com/traceloop/openllmetry-js/commit/207f9fe552cccad23f483ac106833e23186581e7))

# [0.9.0](https://github.com/traceloop/openllmetry-js/compare/v0.8.9...v0.9.0) (2024-07-04)

### Bug Fixes

- **sdk:** versions on workflows & tasks ([#353](https://github.com/traceloop/openllmetry-js/issues/353)) ([eb6211f](https://github.com/traceloop/openllmetry-js/commit/eb6211f5cc9a2930c6bff1d9ffe3cb995eaf6669))

### Features

- Qdrant instrumentation ([#278](https://github.com/traceloop/openllmetry-js/issues/278)) ([3b8224f](https://github.com/traceloop/openllmetry-js/commit/3b8224fac062b6da3f84311569a5ffcc2e3b8744))

# [0.8.0](https://github.com/traceloop/openllmetry-js/compare/v0.7.0...v0.8.0) (2024-04-29)

### Features

- v1 of otel semantic conventions ([#232](https://github.com/traceloop/openllmetry-js/issues/232)) ([8f44173](https://github.com/traceloop/openllmetry-js/commit/8f441733ef7f777c273e6e5594361470b4c7957b))

# [0.7.0](https://github.com/traceloop/openllmetry-js/compare/v0.6.1...v0.7.0) (2024-04-22)

### Bug Fixes

- **openai:** function + tool calling ([#223](https://github.com/traceloop/openllmetry-js/issues/223)) ([790a2de](https://github.com/traceloop/openllmetry-js/commit/790a2de57bf9c30a8aabe473e5262d2125d7b9b2))

# [0.6.0](https://github.com/traceloop/openllmetry-js/compare/v0.5.29...v0.6.0) (2024-04-05)

**Note:** Version bump only for package @traceloop/ai-semantic-conventions

## [0.5.29](https://github.com/traceloop/openllmetry-js/compare/v0.5.28...v0.5.29) (2024-04-03)

### Bug Fixes

- **sdk:** clean and typed instrumentations ([#182](https://github.com/traceloop/openllmetry-js/issues/182)) ([83737ee](https://github.com/traceloop/openllmetry-js/commit/83737ee5291a68c59f255ab91216048824d7406b))

## [0.5.27](https://github.com/traceloop/openllmetry-js/compare/v0.5.26...v0.5.27) (2024-03-26)

### Bug Fixes

- **sdk:** manually report VectorDB spans ([#174](https://github.com/traceloop/openllmetry-js/issues/174)) ([add4900](https://github.com/traceloop/openllmetry-js/commit/add4900c934c4e30672800d1140801a408de43c0))
