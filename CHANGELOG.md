# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.22.6](https://github.com/traceloop/openllmetry-js/compare/v0.22.5...v0.22.6) (2026-01-18)

### Bug Fixes

- **eval:** Add agent tool trajectory eval ([#854](https://github.com/traceloop/openllmetry-js/issues/854)) ([1d1f642](https://github.com/traceloop/openllmetry-js/commit/1d1f6421dc10c64e3a210a9625fd5cb2303837ff))
- **traceloop-sdk:** Add csv and json support to experiment ([#864](https://github.com/traceloop/openllmetry-js/issues/864)) ([114d2b8](https://github.com/traceloop/openllmetry-js/commit/114d2b8f38ddf0abe034157a22ba5112ef40da72))
- **traceloop-sdk:** ai sdk transform response tool calls ([#866](https://github.com/traceloop/openllmetry-js/issues/866)) ([3112d75](https://github.com/traceloop/openllmetry-js/commit/3112d75a48d1fc8fc726145dd0e513e55bd0b7a9))
- **traceloop-sdk:** ai-sdk fixes ([#865](https://github.com/traceloop/openllmetry-js/issues/865)) ([c6655da](https://github.com/traceloop/openllmetry-js/commit/c6655da54a51fdfa0797b316c01304ec46307c0d))

## [0.22.5](https://github.com/traceloop/openllmetry-js/compare/v0.22.4...v0.22.5) (2025-12-17)

### Bug Fixes

- **ai-sdk:** Add conversion to opentelemetry semantic convention ([#845](https://github.com/traceloop/openllmetry-js/issues/845)) ([8e05349](https://github.com/traceloop/openllmetry-js/commit/8e05349a2a09425020beb65c68ea9eb6cb4bc2ca))
- **ai-sdk:** support AI SDK v5 renamed tool attributes (inputSchema, input, output) ([#849](https://github.com/traceloop/openllmetry-js/issues/849)) ([46d8993](https://github.com/traceloop/openllmetry-js/commit/46d89937f9989937de54e72cbb734a46c77d4123))

## [0.22.4](https://github.com/traceloop/openllmetry-js/compare/v0.22.3...v0.22.4) (2025-12-11)

### Bug Fixes

- **ai-sdk:** nest agent spans attribution ([#844](https://github.com/traceloop/openllmetry-js/issues/844)) ([b8ff3d5](https://github.com/traceloop/openllmetry-js/commit/b8ff3d5191d506162c54b2210d6a23987660af27))

## [0.22.3](https://github.com/traceloop/openllmetry-js/compare/v0.22.2...v0.22.3) (2025-12-08)

### Bug Fixes

- add entity input/output to agent spans ([#840](https://github.com/traceloop/openllmetry-js/issues/840)) ([ef152a9](https://github.com/traceloop/openllmetry-js/commit/ef152a90a576e727cc4eeeb5fd0fb0be6ce7c231))

## [0.22.2](https://github.com/traceloop/openllmetry-js/compare/v0.22.1...v0.22.2) (2025-12-02)

### Bug Fixes

- **ai-sdk:** report cached tokens usage ([#839](https://github.com/traceloop/openllmetry-js/issues/839)) ([546092d](https://github.com/traceloop/openllmetry-js/commit/546092dcf2dcbee6c0240bd6e005d1547cb9ef26))

## [0.22.1](https://github.com/traceloop/openllmetry-js/compare/v0.22.0...v0.22.1) (2025-12-01)

### Bug Fixes

- **ai-sdk:** agent name in span names when available ([#838](https://github.com/traceloop/openllmetry-js/issues/838)) ([41f3681](https://github.com/traceloop/openllmetry-js/commit/41f3681a32f81a9791d30204f63149ed994bd07a))

# [0.22.0](https://github.com/traceloop/openllmetry-js/compare/v0.21.1...v0.22.0) (2025-11-27)

### Bug Fixes

- **datasets:** add files support to datasets ([#836](https://github.com/traceloop/openllmetry-js/issues/836)) ([56165f0](https://github.com/traceloop/openllmetry-js/commit/56165f0ab75f6c843e38b01b2be57a3204204934))
- **exp:** Add run in github experiment ([#837](https://github.com/traceloop/openllmetry-js/issues/837)) ([7905242](https://github.com/traceloop/openllmetry-js/commit/79052422fa5e8e4b7c762cb7c8ce9ef84b672e5d))
- transform Vercel AI SDK token attributes to use input_tokens/output_tokens ([1a416a0](https://github.com/traceloop/openllmetry-js/commit/1a416a0debe3673140c8bed54d6eb23cb20f3f8d))
- **vercel:** remove duplicate token attributes (prompt/input and completion/output) ([93b2388](https://github.com/traceloop/openllmetry-js/commit/93b2388192207056074d62d4fca95dfd31b60a5e))

### Features

- use official OpenTelemetry incubating semantic conventions for token attributes ([00e2529](https://github.com/traceloop/openllmetry-js/commit/00e25296877503ff189a76b384aa3d143b1339f7))

## [0.21.1](https://github.com/traceloop/openllmetry-js/compare/v0.21.0...v0.21.1) (2025-11-25)

### Bug Fixes

- **sdk:** remove posthog and telemetry reporting ([#835](https://github.com/traceloop/openllmetry-js/issues/835)) ([61b32f7](https://github.com/traceloop/openllmetry-js/commit/61b32f78c5f46854f35ed83f523259fdd4b3e66a))

# [0.21.0](https://github.com/traceloop/openllmetry-js/compare/v0.20.2...v0.21.0) (2025-11-24)

### Features

- **mcp:** add mcp official sdk instrumentation ([#829](https://github.com/traceloop/openllmetry-js/issues/829)) ([3d7b845](https://github.com/traceloop/openllmetry-js/commit/3d7b84509dfcd51116024a243c62e2100083be93))

## [0.20.2](https://github.com/traceloop/openllmetry-js/compare/v0.20.1...v0.20.2) (2025-11-24)

### Bug Fixes

- **ai-sdk:** add agent detection support for AI SDK ([#830](https://github.com/traceloop/openllmetry-js/issues/830)) ([a1ab720](https://github.com/traceloop/openllmetry-js/commit/a1ab7205d196f70d54deb9cc9d33d2ab64622609))

## [0.20.1](https://github.com/traceloop/openllmetry-js/compare/v0.20.0...v0.20.1) (2025-11-11)

### Bug Fixes

- **sdk:** upgrade `@google-cloud/opentelemetry-cloud-trace-exporter` ([#819](https://github.com/traceloop/openllmetry-js/issues/819)) ([d7e4297](https://github.com/traceloop/openllmetry-js/commit/d7e4297973dd1d9e432f7e3278467be467a7d9c6))

# [0.20.0](https://github.com/traceloop/openllmetry-js/compare/v0.19.1...v0.20.0) (2025-11-04)

### Bug Fixes

- **agent:** Add gen_ai.agent.name span attribute ([#737](https://github.com/traceloop/openllmetry-js/issues/737)) ([b2af9a2](https://github.com/traceloop/openllmetry-js/commit/b2af9a2635624a6e30a271e3d457039166147dda))

### Features

- Add Google Cloud destination support ([#814](https://github.com/traceloop/openllmetry-js/issues/814)) ([e80685a](https://github.com/traceloop/openllmetry-js/commit/e80685a6b4b3550a838b5dbf429e6ad8e8f33415))

## [0.19.1](https://github.com/traceloop/openllmetry-js/compare/v0.19.0...v0.19.1) (2025-09-21)

### Bug Fixes

- **sdk:** proper formatting for vercel AI SDK tool calls ([#736](https://github.com/traceloop/openllmetry-js/issues/736)) ([748cc84](https://github.com/traceloop/openllmetry-js/commit/748cc84a26d6e54ba64fd0beb23a2906c45d9b92))

# [0.19.0](https://github.com/traceloop/openllmetry-js/compare/v0.18.1...v0.19.0) (2025-09-17)

### Bug Fixes

- **sdk:** export getTraceloopTracer for direct tracer access ([#686](https://github.com/traceloop/openllmetry-js/issues/686)) ([768ad76](https://github.com/traceloop/openllmetry-js/commit/768ad767e3704da844bf1a9295ca3b3457ca99f2))

### Features

- **vercel:** add gen.ai.input.messages + gen.ai.output.messages ([#734](https://github.com/traceloop/openllmetry-js/issues/734)) ([4d9f995](https://github.com/traceloop/openllmetry-js/commit/4d9f995df1435f31554ee92024f398d11c3e8ad6))

## [0.18.1](https://github.com/traceloop/openllmetry-js/compare/v0.18.0...v0.18.1) (2025-08-24)

### Bug Fixes

- **sdk:** support vercel AI SDK tool calling + structured outputs ([#675](https://github.com/traceloop/openllmetry-js/issues/675)) ([0371ff7](https://github.com/traceloop/openllmetry-js/commit/0371ff7176fac07d615b5412fb1a71c1a022a9aa))
- **vercel-sdk:** vendor names ([#674](https://github.com/traceloop/openllmetry-js/issues/674)) ([f411da1](https://github.com/traceloop/openllmetry-js/commit/f411da195d25873e058ce3d24bb0c05a6c15c791))

# [0.18.0](https://github.com/traceloop/openllmetry-js/compare/v0.17.1...v0.18.0) (2025-08-24)

### Features

- **experiment:** Add experiment capabilities ([#672](https://github.com/traceloop/openllmetry-js/issues/672)) ([d18b7b2](https://github.com/traceloop/openllmetry-js/commit/d18b7b2811e1b26d9e8f7afb50a0866849dfa0f8))

## [0.17.1](https://github.com/traceloop/openllmetry-js/compare/v0.17.0...v0.17.1) (2025-08-21)

### Bug Fixes

- **anthropic:** add support for Claude thinking API ([#671](https://github.com/traceloop/openllmetry-js/issues/671)) ([088986a](https://github.com/traceloop/openllmetry-js/commit/088986a5e92c003fad6221e76ad0d60bd9410e8f))

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

### Bug Fixes

- **openai:** support for 5.x versions ([#646](https://github.com/traceloop/openllmetry-js/issues/646)) ([588bb01](https://github.com/traceloop/openllmetry-js/commit/588bb01c1e7b93a0e3c7fa3acc2f50e87f977102))

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

**Note:** Version bump only for package openllmetry-js

## [0.14.4](https://github.com/traceloop/openllmetry-js/compare/v0.14.3...v0.14.4) (2025-07-21)

**Note:** Version bump only for package openllmetry-js

## [0.14.3](https://github.com/traceloop/openllmetry-js/compare/v0.14.2...v0.14.3) (2025-07-17)

### Bug Fixes

- **anthropic:** add system prompt to span attributes ([#612](https://github.com/traceloop/openllmetry-js/issues/612)) ([719c6f8](https://github.com/traceloop/openllmetry-js/commit/719c6f83689f3ee341bdc4a777f9b78205340161))

## [0.14.2](https://github.com/traceloop/openllmetry-js/compare/v0.14.1...v0.14.2) (2025-07-17)

### Bug Fixes

- change fetch-retry import to esm module import ([#611](https://github.com/traceloop/openllmetry-js/issues/611)) ([c3b4b22](https://github.com/traceloop/openllmetry-js/commit/c3b4b22a58b8290577e3d808fb088255df7f1364))

## [0.14.1](https://github.com/traceloop/openllmetry-js/compare/v0.14.0...v0.14.1) (2025-07-07)

### Bug Fixes

- **ai-sdk:** transform only specific vercel spans ([#610](https://github.com/traceloop/openllmetry-js/issues/610)) ([04c9dd6](https://github.com/traceloop/openllmetry-js/commit/04c9dd65b010087d19d37db21d365a3b70fb2aa4))

# [0.14.0](https://github.com/traceloop/openllmetry-js/compare/v0.13.5...v0.14.0) (2025-07-04)

### Bug Fixes

- **ai-sdk:** model provider attribute transformation for openai ([#609](https://github.com/traceloop/openllmetry-js/issues/609)) ([5525329](https://github.com/traceloop/openllmetry-js/commit/5525329b6ddb95c32203c9b77b933705aa718f01))

### Features

- added dynamic vendor detection ([#608](https://github.com/traceloop/openllmetry-js/issues/608)) ([288d5c8](https://github.com/traceloop/openllmetry-js/commit/288d5c893fc9635939fbfb6f16222ca394bb068d))

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

**Note:** Version bump only for package openllmetry-js

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

### Bug Fixes

- **openai:** structured output promise unwrapping exception ([#474](https://github.com/traceloop/openllmetry-js/issues/474)) ([546fd9e](https://github.com/traceloop/openllmetry-js/commit/546fd9e6d05eef98a5db7726e3bce267ab57da18))

## [0.11.4](https://github.com/traceloop/openllmetry-js/compare/v0.11.3...v0.11.4) (2024-11-13)

### Bug Fixes

- **langchain:** return exports in langchain runnables module patch ([#470](https://github.com/traceloop/openllmetry-js/issues/470)) ([23fdb28](https://github.com/traceloop/openllmetry-js/commit/23fdb28ab5d7d70a963559b26aae31dde8347082))
- **vertex-ai:** missing system prompt ([#473](https://github.com/traceloop/openllmetry-js/issues/473)) ([663e438](https://github.com/traceloop/openllmetry-js/commit/663e438c5bce18b8fa20c16b7f6d53355bb7b7f9))

## [0.11.3](https://github.com/traceloop/openllmetry-js/compare/v0.11.2...v0.11.3) (2024-10-16)

### Bug Fixes

- **openai:** streaming tool_call + logging multiple tool_call ([#463](https://github.com/traceloop/openllmetry-js/issues/463)) ([5d5de09](https://github.com/traceloop/openllmetry-js/commit/5d5de09e6d32c36a2775ca36cbb14a18fd22f98d))

## [0.11.2](https://github.com/traceloop/openllmetry-js/compare/v0.11.1...v0.11.2) (2024-09-10)

### Bug Fixes

- **sdk:** support custom metrics ([#446](https://github.com/traceloop/openllmetry-js/issues/446)) ([7c77047](https://github.com/traceloop/openllmetry-js/commit/7c770478de41ac5fb934abf7cdeef2abf9c4e018))

## [0.11.1](https://github.com/traceloop/openllmetry-js/compare/v0.11.0...v0.11.1) (2024-08-31)

### Bug Fixes

- **langchain:** instrument vector DB calls ([#440](https://github.com/traceloop/openllmetry-js/issues/440)) ([c129aae](https://github.com/traceloop/openllmetry-js/commit/c129aaec241b4a87f931c2da0774fed96c5c8068))

# [0.11.0](https://github.com/traceloop/openllmetry-js/compare/v0.10.0...v0.11.0) (2024-08-27)

### Bug Fixes

- include dist .mjs for packages with modules declared ([#425](https://github.com/traceloop/openllmetry-js/issues/425)) ([4a7ec33](https://github.com/traceloop/openllmetry-js/commit/4a7ec33ca5de6a1ad4ba6364bcff4fff8cb2b664))
- **sdk:** use headers from env if available ([#435](https://github.com/traceloop/openllmetry-js/issues/435)) ([31aa015](https://github.com/traceloop/openllmetry-js/commit/31aa015505e9a3e26be1cfaafa34a218aad15499))

### Features

- **instrumentation-chromadb,instrumentation-qdrant:** add esm exports ([#428](https://github.com/traceloop/openllmetry-js/issues/428)) ([dfd418b](https://github.com/traceloop/openllmetry-js/commit/dfd418be6d836a53bb339dda439b1875f79389dd))

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

**Note:** Version bump only for package openllmetry-js

## [0.9.2](https://github.com/traceloop/openllmetry-js/compare/v0.9.1...v0.9.2) (2024-07-17)

### Bug Fixes

- added missing tslib dependency ([#369](https://github.com/traceloop/openllmetry-js/issues/369)) ([b20145d](https://github.com/traceloop/openllmetry-js/commit/b20145d13b391737febb5b57e4bc8c66b0f32b95))

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

### Bug Fixes

- **openai:** switched to pure js tiktoken ([#248](https://github.com/traceloop/openllmetry-js/issues/248)) ([9d8805e](https://github.com/traceloop/openllmetry-js/commit/9d8805e20e7814ddf7aefbcd31ecb8c7f928b742))

## [0.8.1](https://github.com/traceloop/openllmetry-js/compare/v0.8.0...v0.8.1) (2024-05-06)

### Bug Fixes

- **chromadb:** use rollup ([#247](https://github.com/traceloop/openllmetry-js/issues/247)) ([b7566bf](https://github.com/traceloop/openllmetry-js/commit/b7566bf0057c2150b33d4302740e4dd0b40e6a11))

# [0.8.0](https://github.com/traceloop/openllmetry-js/compare/v0.7.0...v0.8.0) (2024-04-29)

### Features

- v1 of otel semantic conventions ([#232](https://github.com/traceloop/openllmetry-js/issues/232)) ([8f44173](https://github.com/traceloop/openllmetry-js/commit/8f441733ef7f777c273e6e5594361470b4c7957b))

# [0.7.0](https://github.com/traceloop/openllmetry-js/compare/v0.6.1...v0.7.0) (2024-04-22)

### Bug Fixes

- **openai:** function + tool calling ([#223](https://github.com/traceloop/openllmetry-js/issues/223)) ([790a2de](https://github.com/traceloop/openllmetry-js/commit/790a2de57bf9c30a8aabe473e5262d2125d7b9b2))

### Features

- instrumentation for chromadb ([#79](https://github.com/traceloop/openllmetry-js/issues/79)) ([085f4fb](https://github.com/traceloop/openllmetry-js/commit/085f4fbc011ea5ea5465cf7b9c96db42c5302b76))

## [0.6.1](https://github.com/traceloop/openllmetry-js/compare/v0.6.0...v0.6.1) (2024-04-22)

### Bug Fixes

- handle exceptions ([#214](https://github.com/traceloop/openllmetry-js/issues/214)) ([65f9be4](https://github.com/traceloop/openllmetry-js/commit/65f9be4fdcaa40f5bfd6c1fe3edc60910b4af894))

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
