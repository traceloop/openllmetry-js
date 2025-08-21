# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.17.1](https://github.com/traceloop/openllmetry-js/compare/v0.17.0...v0.17.1) (2025-08-21)

**Note:** Version bump only for package @traceloop/node-server-sdk

# [0.17.0](https://github.com/traceloop/openllmetry-js/compare/v0.16.2...v0.17.0) (2025-08-18)

### Features

- **langchain:** implement callback-based instrumentation with auto-injection ([#649](https://github.com/traceloop/openllmetry-js/issues/649)) ([fe78b1b](https://github.com/traceloop/openllmetry-js/commit/fe78b1b512d04f8e33e2f1886465e08870a1b56f))

## [0.16.2](https://github.com/traceloop/openllmetry-js/compare/v0.16.1...v0.16.2) (2025-08-17)

### Bug Fixes

- **sdk:** otel v1 resource backward compatibility ([#648](https://github.com/traceloop/openllmetry-js/issues/648)) ([0c21b36](https://github.com/traceloop/openllmetry-js/commit/0c21b3616ff6cbe4035158f2cc85764de0f34a7d))

## [0.16.1](https://github.com/traceloop/openllmetry-js/compare/v0.16.0...v0.16.1) (2025-08-15)

### Bug Fixes

- **sdk:** defensive resource creation for otel v1, v2 resolution ([#647](https://github.com/traceloop/openllmetry-js/issues/647)) ([27bfaec](https://github.com/traceloop/openllmetry-js/commit/27bfaec0ba5b23246603809f5e9fd30512a9f88f))

# [0.16.0](https://github.com/traceloop/openllmetry-js/compare/v0.15.0...v0.16.0) (2025-08-14)

### Features

- add datasets api ([#643](https://github.com/traceloop/openllmetry-js/issues/643)) ([e240945](https://github.com/traceloop/openllmetry-js/commit/e2409456a7c9bd856f5af76fa475fcd5f18a5246))

# [0.15.0](https://github.com/traceloop/openllmetry-js/compare/v0.14.6...v0.15.0) (2025-08-11)

### Features

- **openai:** image generation support ([#623](https://github.com/traceloop/openllmetry-js/issues/623)) ([2955975](https://github.com/traceloop/openllmetry-js/commit/2955975f956e0a3489d36cf7621b33f66e7bc42a))

## [0.14.6](https://github.com/traceloop/openllmetry-js/compare/v0.14.5...v0.14.6) (2025-07-28)

### Bug Fixes

- **build:** use local deps from workspace during build ([#620](https://github.com/traceloop/openllmetry-js/issues/620)) ([59012a0](https://github.com/traceloop/openllmetry-js/commit/59012a07b9dedb9a63c3791507c615782f0f5003))
- **sdk:** allow empty initialize() ([#619](https://github.com/traceloop/openllmetry-js/issues/619)) ([5e12228](https://github.com/traceloop/openllmetry-js/commit/5e12228b083c864b2fbe916acbb97295374f945b))

## [0.14.5](https://github.com/traceloop/openllmetry-js/compare/v0.14.4...v0.14.5) (2025-07-26)

**Note:** Version bump only for package @traceloop/node-server-sdk

## [0.14.4](https://github.com/traceloop/openllmetry-js/compare/v0.14.3...v0.14.4) (2025-07-21)

**Note:** Version bump only for package @traceloop/node-server-sdk

## [0.14.3](https://github.com/traceloop/openllmetry-js/compare/v0.14.2...v0.14.3) (2025-07-17)

**Note:** Version bump only for package @traceloop/node-server-sdk

## [0.14.2](https://github.com/traceloop/openllmetry-js/compare/v0.14.1...v0.14.2) (2025-07-17)

### Bug Fixes

- change fetch-retry import to esm module import ([#611](https://github.com/traceloop/openllmetry-js/issues/611)) ([c3b4b22](https://github.com/traceloop/openllmetry-js/commit/c3b4b22a58b8290577e3d808fb088255df7f1364))

## [0.14.1](https://github.com/traceloop/openllmetry-js/compare/v0.14.0...v0.14.1) (2025-07-07)

### Bug Fixes

- **ai-sdk:** transform only specific vercel spans ([#610](https://github.com/traceloop/openllmetry-js/issues/610)) ([04c9dd6](https://github.com/traceloop/openllmetry-js/commit/04c9dd65b010087d19d37db21d365a3b70fb2aa4))

# [0.14.0](https://github.com/traceloop/openllmetry-js/compare/v0.13.5...v0.14.0) (2025-07-04)

### Bug Fixes

- **ai-sdk:** model provider attribute transformation for openai ([#609](https://github.com/traceloop/openllmetry-js/issues/609)) ([5525329](https://github.com/traceloop/openllmetry-js/commit/5525329b6ddb95c32203c9b77b933705aa718f01))

## [0.13.5](https://github.com/traceloop/openllmetry-js/compare/v0.13.4...v0.13.5) (2025-06-27)

### Bug Fixes

- **sdk:** add vercel AI SDK to span-processor whitelist ([#607](https://github.com/traceloop/openllmetry-js/issues/607)) ([667ba2d](https://github.com/traceloop/openllmetry-js/commit/667ba2d306eb915b086212c15f2571d91be650cd))

## [0.13.4](https://github.com/traceloop/openllmetry-js/compare/v0.13.3...v0.13.4) (2025-06-10)

### Bug Fixes

- **anthropic:** upgrade supported version of anthropic SDK ([#604](https://github.com/traceloop/openllmetry-js/issues/604)) ([1ac8678](https://github.com/traceloop/openllmetry-js/commit/1ac8678b269c080eaaa6766e11bac4ace633f3b1))

## [0.13.3](https://github.com/traceloop/openllmetry-js/compare/v0.13.2...v0.13.3) (2025-04-29)

### Bug Fixes

- **tracing:** otel log level setup only for non-standalone processor ([#600](https://github.com/traceloop/openllmetry-js/issues/600)) ([f2e432f](https://github.com/traceloop/openllmetry-js/commit/f2e432f8ce15198ea6982b5107b465a9ab0f8c34))

## [0.13.2](https://github.com/traceloop/openllmetry-js/compare/v0.13.1...v0.13.2) (2025-04-27)

### Bug Fixes

- **tracing:** introduce tracingEnabled option to support sdk initialization for standalone processor ([#599](https://github.com/traceloop/openllmetry-js/issues/599)) ([1fa682e](https://github.com/traceloop/openllmetry-js/commit/1fa682e89cdb232388efef8d265c67396f539293))

## [0.13.1](https://github.com/traceloop/openllmetry-js/compare/v0.13.0...v0.13.1) (2025-04-24)

### Bug Fixes

- **traceloop-sdk:** omit spans of non-traceloop instrumentations by default when using standalone processor ([#598](https://github.com/traceloop/openllmetry-js/issues/598)) ([c6b40a0](https://github.com/traceloop/openllmetry-js/commit/c6b40a0e3ad5fe4a40dddf01b03bce20d94bf46b))

# [0.13.0](https://github.com/traceloop/openllmetry-js/compare/v0.12.2...v0.13.0) (2025-04-22)

### Features

- **traceloop-sdk:** standalone span processor ([#596](https://github.com/traceloop/openllmetry-js/issues/596)) ([05a6326](https://github.com/traceloop/openllmetry-js/commit/05a632687296e8e4bd3cc2621a9403e483f5f729))

## [0.12.2](https://github.com/traceloop/openllmetry-js/compare/v0.12.1...v0.12.2) (2025-03-12)

### Bug Fixes

- **sdk:** headers as an argument in initialization ([#569](https://github.com/traceloop/openllmetry-js/issues/569)) ([7aec655](https://github.com/traceloop/openllmetry-js/commit/7aec65515256ae9fa0fae44d03bc9059eeb3adcc))

## [0.12.1](https://github.com/traceloop/openllmetry-js/compare/v0.12.0...v0.12.1) (2025-02-20)

**Note:** Version bump only for package @traceloop/node-server-sdk

# [0.12.0](https://github.com/traceloop/openllmetry-js/compare/v0.11.7...v0.12.0) (2025-01-13)

### Features

- **sdk:** client, annotations ([#498](https://github.com/traceloop/openllmetry-js/issues/498)) ([6e4192e](https://github.com/traceloop/openllmetry-js/commit/6e4192ebb69ec5f3e65cef9aa3c91a5251ab1ab2))

## [0.11.7](https://github.com/traceloop/openllmetry-js/compare/v0.11.6...v0.11.7) (2024-12-20)

### Bug Fixes

- **sdk:** patch span attributes for vercel AI users ([#478](https://github.com/traceloop/openllmetry-js/issues/478)) ([33eca03](https://github.com/traceloop/openllmetry-js/commit/33eca033db8bf2ab65718d29b0105b71cd569c36))

## [0.11.6](https://github.com/traceloop/openllmetry-js/compare/v0.11.5...v0.11.6) (2024-12-16)

### Bug Fixes

- **deps:** major, minor and various instrumentation fixes ([0f18865](https://github.com/traceloop/openllmetry-js/commit/0f18865c4270c918f6c0b1bec701dc947353a213))

## [0.11.5](https://github.com/traceloop/openllmetry-js/compare/v0.11.4...v0.11.5) (2024-12-11)

**Note:** Version bump only for package @traceloop/node-server-sdk

## [0.11.4](https://github.com/traceloop/openllmetry-js/compare/v0.11.3...v0.11.4) (2024-11-13)

**Note:** Version bump only for package @traceloop/node-server-sdk

## [0.11.3](https://github.com/traceloop/openllmetry-js/compare/v0.11.2...v0.11.3) (2024-10-16)

**Note:** Version bump only for package @traceloop/node-server-sdk

## [0.11.2](https://github.com/traceloop/openllmetry-js/compare/v0.11.1...v0.11.2) (2024-09-10)

### Bug Fixes

- **sdk:** support custom metrics ([#446](https://github.com/traceloop/openllmetry-js/issues/446)) ([7c77047](https://github.com/traceloop/openllmetry-js/commit/7c770478de41ac5fb934abf7cdeef2abf9c4e018))

## [0.11.1](https://github.com/traceloop/openllmetry-js/compare/v0.11.0...v0.11.1) (2024-08-31)

### Bug Fixes

- **langchain:** instrument vector DB calls ([#440](https://github.com/traceloop/openllmetry-js/issues/440)) ([c129aae](https://github.com/traceloop/openllmetry-js/commit/c129aaec241b4a87f931c2da0774fed96c5c8068))

# [0.11.0](https://github.com/traceloop/openllmetry-js/compare/v0.10.0...v0.11.0) (2024-08-27)

### Bug Fixes

- **sdk:** use headers from env if available ([#435](https://github.com/traceloop/openllmetry-js/issues/435)) ([31aa015](https://github.com/traceloop/openllmetry-js/commit/31aa015505e9a3e26be1cfaafa34a218aad15499))

# [0.10.0](https://github.com/traceloop/openllmetry-js/compare/v0.9.5...v0.10.0) (2024-08-01)

### Features

- introduce traceloop.entity.path instead of traceloop.entity.name chaining ([#393](https://github.com/traceloop/openllmetry-js/issues/393)) ([207f9fe](https://github.com/traceloop/openllmetry-js/commit/207f9fe552cccad23f483ac106833e23186581e7))

## [0.9.5](https://github.com/traceloop/openllmetry-js/compare/v0.9.4...v0.9.5) (2024-07-30)

### Bug Fixes

- **sdk:** option to suppress instrumentations ([#392](https://github.com/traceloop/openllmetry-js/issues/392)) ([d6ccf0d](https://github.com/traceloop/openllmetry-js/commit/d6ccf0d1633255499c06521dca179bec2deb9bbd))

## [0.9.4](https://github.com/traceloop/openllmetry-js/compare/v0.9.3...v0.9.4) (2024-07-28)

### Bug Fixes

- **sdk:** properly initialize token enrich value for instrumentations ([#384](https://github.com/traceloop/openllmetry-js/issues/384)) ([143bc66](https://github.com/traceloop/openllmetry-js/commit/143bc6671447299824d5cf1d4b4da4eea417d6f4))

## [0.9.3](https://github.com/traceloop/openllmetry-js/compare/v0.9.2...v0.9.3) (2024-07-25)

**Note:** Version bump only for package @traceloop/node-server-sdk

## [0.9.2](https://github.com/traceloop/openllmetry-js/compare/v0.9.1...v0.9.2) (2024-07-17)

**Note:** Version bump only for package @traceloop/node-server-sdk

## [0.9.1](https://github.com/traceloop/openllmetry-js/compare/v0.9.0...v0.9.1) (2024-07-10)

### Bug Fixes

- **sdk:** support parameters needed by Sentry SDK ([#360](https://github.com/traceloop/openllmetry-js/issues/360)) ([b1f195c](https://github.com/traceloop/openllmetry-js/commit/b1f195cb56106649347bea0de684c2355cdcb2a1))

# [0.9.0](https://github.com/traceloop/openllmetry-js/compare/v0.8.9...v0.9.0) (2024-07-04)

### Bug Fixes

- **sdk:** option to silence initialization message ([#343](https://github.com/traceloop/openllmetry-js/issues/343)) ([75c68ce](https://github.com/traceloop/openllmetry-js/commit/75c68ceb09dec3766f30ed413bdeee637e1734a6))
- **sdk:** versions on workflows & tasks ([#353](https://github.com/traceloop/openllmetry-js/issues/353)) ([eb6211f](https://github.com/traceloop/openllmetry-js/commit/eb6211f5cc9a2930c6bff1d9ffe3cb995eaf6669))

### Features

- Qdrant instrumentation ([#278](https://github.com/traceloop/openllmetry-js/issues/278)) ([3b8224f](https://github.com/traceloop/openllmetry-js/commit/3b8224fac062b6da3f84311569a5ffcc2e3b8744))

## [0.8.9](https://github.com/traceloop/openllmetry-js/compare/v0.8.8...v0.8.9) (2024-06-17)

### Bug Fixes

- **sdk:** run workflows in parallel with different association proper… ([#329](https://github.com/traceloop/openllmetry-js/issues/329)) ([9a8f84c](https://github.com/traceloop/openllmetry-js/commit/9a8f84c3659558b88d2148a796cb3c72e3f883d1))

## [0.8.8](https://github.com/traceloop/openllmetry-js/compare/v0.8.7...v0.8.8) (2024-06-16)

### Bug Fixes

- **sdk:** serialization of Map in sub-objects of inputs and outputs ([#323](https://github.com/traceloop/openllmetry-js/issues/323)) ([49b032a](https://github.com/traceloop/openllmetry-js/commit/49b032af74d4d5dd6d79654e6ffc0b15f50fb983))

## [0.8.7](https://github.com/traceloop/openllmetry-js/compare/v0.8.6...v0.8.7) (2024-06-12)

### Bug Fixes

- **sdk:** propagate association properties within a workflow ([#318](https://github.com/traceloop/openllmetry-js/issues/318)) ([3e530bc](https://github.com/traceloop/openllmetry-js/commit/3e530bcd3f1892a2f4c5e89c59609a117742b358))

## [0.8.6](https://github.com/traceloop/openllmetry-js/compare/v0.8.5...v0.8.6) (2024-06-03)

### Bug Fixes

- remove sentry; lower noise for instrumentation errors ([#294](https://github.com/traceloop/openllmetry-js/issues/294)) ([c4e3782](https://github.com/traceloop/openllmetry-js/commit/c4e37829ee40983b29831cb68b0343f993f0a33a))

## [0.8.5](https://github.com/traceloop/openllmetry-js/compare/v0.8.4...v0.8.5) (2024-05-31)

### Bug Fixes

- **vertex:** support v1.2.0 ([#290](https://github.com/traceloop/openllmetry-js/issues/290)) ([e62c9b4](https://github.com/traceloop/openllmetry-js/commit/e62c9b420881b69971d3ee910c5d3f613df3be50))

## [0.8.4](https://github.com/traceloop/openllmetry-js/compare/v0.8.3...v0.8.4) (2024-05-20)

### Bug Fixes

- **manual-tracing:** add missing llm.request.type attribute ([#269](https://github.com/traceloop/openllmetry-js/issues/269)) ([528c498](https://github.com/traceloop/openllmetry-js/commit/528c49850fb2a9b87cea92466b87aa6b0681d285))
- **sdk:** serialize map outputs for non-promise outputs ([#276](https://github.com/traceloop/openllmetry-js/issues/276)) ([b4a8948](https://github.com/traceloop/openllmetry-js/commit/b4a8948314e413bbbee47c9f8d8698d98634ff18))
- **sdk:** used wrong completion attribute in manual instrumentations ([#277](https://github.com/traceloop/openllmetry-js/issues/277)) ([b434f61](https://github.com/traceloop/openllmetry-js/commit/b434f61dd55da9967738bf4aa6110e1816a730e0))

## [0.8.3](https://github.com/traceloop/openllmetry-js/compare/v0.8.2...v0.8.3) (2024-05-16)

### Bug Fixes

- **sdk:** api for manual logging of LLM calls ([#264](https://github.com/traceloop/openllmetry-js/issues/264)) ([500097c](https://github.com/traceloop/openllmetry-js/commit/500097cb3534ccafef9c50d93d94f6606cd75016))

## [0.8.2](https://github.com/traceloop/openllmetry-js/compare/v0.8.1...v0.8.2) (2024-05-07)

**Note:** Version bump only for package @traceloop/node-server-sdk

## [0.8.1](https://github.com/traceloop/openllmetry-js/compare/v0.8.0...v0.8.1) (2024-05-06)

**Note:** Version bump only for package @traceloop/node-server-sdk

# [0.8.0](https://github.com/traceloop/openllmetry-js/compare/v0.7.0...v0.8.0) (2024-04-29)

**Note:** Version bump only for package @traceloop/node-server-sdk

# [0.7.0](https://github.com/traceloop/openllmetry-js/compare/v0.6.1...v0.7.0) (2024-04-22)

### Features

- instrumentation for chromadb ([#79](https://github.com/traceloop/openllmetry-js/issues/79)) ([085f4fb](https://github.com/traceloop/openllmetry-js/commit/085f4fbc011ea5ea5465cf7b9c96db42c5302b76))

## [0.6.1](https://github.com/traceloop/openllmetry-js/compare/v0.6.0...v0.6.1) (2024-04-22)

### Bug Fixes

- handle exceptions ([#214](https://github.com/traceloop/openllmetry-js/issues/214)) ([65f9be4](https://github.com/traceloop/openllmetry-js/commit/65f9be4fdcaa40f5bfd6c1fe3edc60910b4af894))

# [0.6.0](https://github.com/traceloop/openllmetry-js/compare/v0.5.29...v0.6.0) (2024-04-05)

### Features

- **anthropic:** instrumentation ([#188](https://github.com/traceloop/openllmetry-js/issues/188)) ([f40df74](https://github.com/traceloop/openllmetry-js/commit/f40df747143279a9a153db58020bf4531b5c171f))

## [0.5.29](https://github.com/traceloop/openllmetry-js/compare/v0.5.28...v0.5.29) (2024-04-03)

### Bug Fixes

- **openai:** enrich token metrics on streaming requests ([#183](https://github.com/traceloop/openllmetry-js/issues/183)) ([2ef0c13](https://github.com/traceloop/openllmetry-js/commit/2ef0c13f16b050d6f73ea9a5952abd0bbfe8a284))
- **sdk:** clean and typed instrumentations ([#182](https://github.com/traceloop/openllmetry-js/issues/182)) ([83737ee](https://github.com/traceloop/openllmetry-js/commit/83737ee5291a68c59f255ab91216048824d7406b))

## [0.5.28](https://github.com/traceloop/openllmetry-js/compare/v0.5.27...v0.5.28) (2024-04-02)

### Bug Fixes

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

**Note:** Version bump only for package @traceloop/node-server-sdk
