# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.6](https://github.com/traceloop/openllmetry-js/compare/v0.11.5...v0.11.6) (2024-12-16)

### Bug Fixes

- **deps:** major, minor and various instrumentation fixes ([0f18865](https://github.com/traceloop/openllmetry-js/commit/0f18865c4270c918f6c0b1bec701dc947353a213))

## [0.11.5](https://github.com/traceloop/openllmetry-js/compare/v0.11.4...v0.11.5) (2024-12-11)

### Bug Fixes

- **openai:** structured output promise unwrapping exception ([#474](https://github.com/traceloop/openllmetry-js/issues/474)) ([546fd9e](https://github.com/traceloop/openllmetry-js/commit/546fd9e6d05eef98a5db7726e3bce267ab57da18))

## [0.11.3](https://github.com/traceloop/openllmetry-js/compare/v0.11.2...v0.11.3) (2024-10-16)

### Bug Fixes

- **openai:** streaming tool_call + logging multiple tool_call ([#463](https://github.com/traceloop/openllmetry-js/issues/463)) ([5d5de09](https://github.com/traceloop/openllmetry-js/commit/5d5de09e6d32c36a2775ca36cbb14a18fd22f98d))

## [0.11.1](https://github.com/traceloop/openllmetry-js/compare/v0.11.0...v0.11.1) (2024-08-31)

### Bug Fixes

- **langchain:** instrument vector DB calls ([#440](https://github.com/traceloop/openllmetry-js/issues/440)) ([c129aae](https://github.com/traceloop/openllmetry-js/commit/c129aaec241b4a87f931c2da0774fed96c5c8068))

# [0.11.0](https://github.com/traceloop/openllmetry-js/compare/v0.10.0...v0.11.0) (2024-08-27)

### Bug Fixes

- include dist .mjs for packages with modules declared ([#425](https://github.com/traceloop/openllmetry-js/issues/425)) ([4a7ec33](https://github.com/traceloop/openllmetry-js/commit/4a7ec33ca5de6a1ad4ba6364bcff4fff8cb2b664))

# [0.10.0](https://github.com/traceloop/openllmetry-js/compare/v0.9.5...v0.10.0) (2024-08-01)

**Note:** Version bump only for package @traceloop/instrumentation-openai

## [0.9.2](https://github.com/traceloop/openllmetry-js/compare/v0.9.1...v0.9.2) (2024-07-17)

### Bug Fixes

- added missing tslib dependency ([#369](https://github.com/traceloop/openllmetry-js/issues/369)) ([b20145d](https://github.com/traceloop/openllmetry-js/commit/b20145d13b391737febb5b57e4bc8c66b0f32b95))

# [0.9.0](https://github.com/traceloop/openllmetry-js/compare/v0.8.9...v0.9.0) (2024-07-04)

**Note:** Version bump only for package @traceloop/instrumentation-openai

## [0.8.8](https://github.com/traceloop/openllmetry-js/compare/v0.8.7...v0.8.8) (2024-06-16)

**Note:** Version bump only for package @traceloop/instrumentation-openai

## [0.8.6](https://github.com/traceloop/openllmetry-js/compare/v0.8.5...v0.8.6) (2024-06-03)

### Bug Fixes

- remove sentry; lower noise for instrumentation errors ([#294](https://github.com/traceloop/openllmetry-js/issues/294)) ([c4e3782](https://github.com/traceloop/openllmetry-js/commit/c4e37829ee40983b29831cb68b0343f993f0a33a))

## [0.8.2](https://github.com/traceloop/openllmetry-js/compare/v0.8.1...v0.8.2) (2024-05-07)

### Bug Fixes

- **openai:** switched to pure js tiktoken ([#248](https://github.com/traceloop/openllmetry-js/issues/248)) ([9d8805e](https://github.com/traceloop/openllmetry-js/commit/9d8805e20e7814ddf7aefbcd31ecb8c7f928b742))

# [0.8.0](https://github.com/traceloop/openllmetry-js/compare/v0.7.0...v0.8.0) (2024-04-29)

### Features

- v1 of otel semantic conventions ([#232](https://github.com/traceloop/openllmetry-js/issues/232)) ([8f44173](https://github.com/traceloop/openllmetry-js/commit/8f441733ef7f777c273e6e5594361470b4c7957b))

# [0.7.0](https://github.com/traceloop/openllmetry-js/compare/v0.6.1...v0.7.0) (2024-04-22)

### Bug Fixes

- **openai:** function + tool calling ([#223](https://github.com/traceloop/openllmetry-js/issues/223)) ([790a2de](https://github.com/traceloop/openllmetry-js/commit/790a2de57bf9c30a8aabe473e5262d2125d7b9b2))

## [0.6.1](https://github.com/traceloop/openllmetry-js/compare/v0.6.0...v0.6.1) (2024-04-22)

### Bug Fixes

- handle exceptions ([#214](https://github.com/traceloop/openllmetry-js/issues/214)) ([65f9be4](https://github.com/traceloop/openllmetry-js/commit/65f9be4fdcaa40f5bfd6c1fe3edc60910b4af894))

# [0.6.0](https://github.com/traceloop/openllmetry-js/compare/v0.5.29...v0.6.0) (2024-04-05)

**Note:** Version bump only for package @traceloop/instrumentation-openai

## [0.5.29](https://github.com/traceloop/openllmetry-js/compare/v0.5.28...v0.5.29) (2024-04-03)

### Bug Fixes

- **openai:** enrich token metrics on streaming requests ([#183](https://github.com/traceloop/openllmetry-js/issues/183)) ([2ef0c13](https://github.com/traceloop/openllmetry-js/commit/2ef0c13f16b050d6f73ea9a5952abd0bbfe8a284))

## [0.5.28](https://github.com/traceloop/openllmetry-js/compare/v0.5.27...v0.5.28) (2024-04-02)

### Bug Fixes

- **openai-instrumentation:** logprobs reporting using span event ([#172](https://github.com/traceloop/openllmetry-js/issues/172)) ([923df7f](https://github.com/traceloop/openllmetry-js/commit/923df7fdb855bcfb16d9571199129d3eaa527eb8))

## [0.5.27](https://github.com/traceloop/openllmetry-js/compare/v0.5.26...v0.5.27) (2024-03-26)

**Note:** Version bump only for package @traceloop/instrumentation-openai

## [0.5.24](https://github.com/traceloop/openllmetry-js/compare/v0.5.23...v0.5.24) (2024-03-15)

### Bug Fixes

- switch to rollup for all instrumentations ([#155](https://github.com/traceloop/openllmetry-js/issues/155)) ([605fb46](https://github.com/traceloop/openllmetry-js/commit/605fb46859dc2424fc933268122fb430cefda9ed))

## [0.5.23](https://github.com/traceloop/openllmetry-js/compare/v0.5.22...v0.5.23) (2024-03-15)

### Bug Fixes

- log instrumentation patching ([#148](https://github.com/traceloop/openllmetry-js/issues/148)) ([82d82bf](https://github.com/traceloop/openllmetry-js/commit/82d82bf563e950fe66f8e2fe64ce7bde3dba222b))
- only import types in all instrumentations ([#150](https://github.com/traceloop/openllmetry-js/issues/150)) ([7304563](https://github.com/traceloop/openllmetry-js/commit/7304563d9abcd5acfaeed7e16bea64a7245890c7))
- use correct versions from package.json ([#154](https://github.com/traceloop/openllmetry-js/issues/154)) ([a095fbc](https://github.com/traceloop/openllmetry-js/commit/a095fbcae3d45bd12a772a4e76ed93e64446e062))
