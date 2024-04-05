# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.6.0](https://github.com/traceloop/openllmetry-js/compare/v0.5.29...v0.6.0) (2024-04-05)

### Bug Fixes

- **anthropic:** support streaming for completion API ([#191](https://github.com/traceloop/openllmetry-js/issues/191)) ([0efb330](https://github.com/traceloop/openllmetry-js/commit/0efb3302f9ff767cba29519265c13ca4f02cf612))

### Features

- **anthropic:** instrumentation ([#188](https://github.com/traceloop/openllmetry-js/issues/188)) ([f40df74](https://github.com/traceloop/openllmetry-js/commit/f40df747143279a9a153db58020bf4531b5c171f))

## [0.5.29](https://github.com/traceloop/openllmetry-js/compare/v0.5.28...v0.5.29) (2024-04-03)

### Bug Fixes

- **openai:** enrich token metrics on streaming requests ([#183](https://github.com/traceloop/openllmetry-js/issues/183)) ([2ef0c13](https://github.com/traceloop/openllmetry-js/commit/2ef0c13f16b050d6f73ea9a5952abd0bbfe8a284))
- **sdk:** clean and typed instrumentations ([#182](https://github.com/traceloop/openllmetry-js/issues/182)) ([83737ee](https://github.com/traceloop/openllmetry-js/commit/83737ee5291a68c59f255ab91216048824d7406b))

## [0.5.28](https://github.com/traceloop/openllmetry-js/compare/v0.5.27...v0.5.28) (2024-04-02)

### Bug Fixes

- **openai-instrumentation:** logprobs reporting using span event ([#172](https://github.com/traceloop/openllmetry-js/issues/172)) ([923df7f](https://github.com/traceloop/openllmetry-js/commit/923df7fdb855bcfb16d9571199129d3eaa527eb8))
- **sdk:** allow passing a function to the decorator ([#181](https://github.com/traceloop/openllmetry-js/issues/181)) ([2178f1c](https://github.com/traceloop/openllmetry-js/commit/2178f1c5161218ffc7938bfe17fc1ced8190357c))
- **sdk:** decorator bug with passing `this` parameter ([#180](https://github.com/traceloop/openllmetry-js/issues/180)) ([956bad4](https://github.com/traceloop/openllmetry-js/commit/956bad4d357752b2a6b640fdc5ba76c22bbacaca))

## [0.5.27](https://github.com/traceloop/openllmetry-js/compare/v0.5.26...v0.5.27) (2024-03-26)

### Bug Fixes

- **sdk:** manually report VectorDB spans ([#174](https://github.com/traceloop/openllmetry-js/issues/174)) ([add4900](https://github.com/traceloop/openllmetry-js/commit/add4900c934c4e30672800d1140801a408de43c0))

## [0.5.26](https://github.com/traceloop/openllmetry-js/compare/v0.5.25...v0.5.26) (2024-03-26)

### Bug Fixes

- **sdk:** manual instrumentation in all modules ([#171](https://github.com/traceloop/openllmetry-js/issues/171)) ([e5784a4](https://github.com/traceloop/openllmetry-js/commit/e5784a4bb834930420f77cf350de9a5d93e6bc71))

## [0.5.25](https://github.com/traceloop/openllmetry-js/compare/v0.5.24...v0.5.25) (2024-03-15)

### Bug Fixes

- **sdk:** do not initialize logger if not instructed ([#156](https://github.com/traceloop/openllmetry-js/issues/156)) ([cab900c](https://github.com/traceloop/openllmetry-js/commit/cab900c5c1233bb11cdf3f4b41c39005769b9ea0))

## [0.5.24](https://github.com/traceloop/openllmetry-js/compare/v0.5.23...v0.5.24) (2024-03-15)

### Bug Fixes

- switch to rollup for all instrumentations ([#155](https://github.com/traceloop/openllmetry-js/issues/155)) ([605fb46](https://github.com/traceloop/openllmetry-js/commit/605fb46859dc2424fc933268122fb430cefda9ed))

## [0.5.23](https://github.com/traceloop/openllmetry-js/compare/v0.5.22...v0.5.23) (2024-03-15)

### Bug Fixes

- log instrumentation patching ([#148](https://github.com/traceloop/openllmetry-js/issues/148)) ([82d82bf](https://github.com/traceloop/openllmetry-js/commit/82d82bf563e950fe66f8e2fe64ce7bde3dba222b))
- only import types in all instrumentations ([#150](https://github.com/traceloop/openllmetry-js/issues/150)) ([7304563](https://github.com/traceloop/openllmetry-js/commit/7304563d9abcd5acfaeed7e16bea64a7245890c7))
- **sdk:** update deprecations in otel ([#149](https://github.com/traceloop/openllmetry-js/issues/149)) ([ddfc3a2](https://github.com/traceloop/openllmetry-js/commit/ddfc3a2dd967b42d5662a24fc3d59cd9cc015c7b))
- use correct versions from package.json ([#154](https://github.com/traceloop/openllmetry-js/issues/154)) ([a095fbc](https://github.com/traceloop/openllmetry-js/commit/a095fbcae3d45bd12a772a4e76ed93e64446e062))

## [0.5.22](https://github.com/traceloop/openllmetry-js/compare/v0.5.21...v0.5.22) (2024-03-15)

### Bug Fixes

- **llamaindex:** support streaming ([#142](https://github.com/traceloop/openllmetry-js/issues/142)) ([beec5b8](https://github.com/traceloop/openllmetry-js/commit/beec5b84125e10c97a71218a40103aa9ad35f12a))
