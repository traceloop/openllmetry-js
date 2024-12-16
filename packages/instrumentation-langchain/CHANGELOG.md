# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.6](https://github.com/traceloop/openllmetry-js/compare/v0.11.5...v0.11.6) (2024-12-16)

### Bug Fixes

- **deps:** major, minor and various instrumentation fixes ([0f18865](https://github.com/traceloop/openllmetry-js/commit/0f18865c4270c918f6c0b1bec701dc947353a213))

## [0.11.4](https://github.com/traceloop/openllmetry-js/compare/v0.11.3...v0.11.4) (2024-11-13)

### Bug Fixes

- **langchain:** return exports in langchain runnables module patch ([#470](https://github.com/traceloop/openllmetry-js/issues/470)) ([23fdb28](https://github.com/traceloop/openllmetry-js/commit/23fdb28ab5d7d70a963559b26aae31dde8347082))

## [0.11.1](https://github.com/traceloop/openllmetry-js/compare/v0.11.0...v0.11.1) (2024-08-31)

### Bug Fixes

- **langchain:** instrument vector DB calls ([#440](https://github.com/traceloop/openllmetry-js/issues/440)) ([c129aae](https://github.com/traceloop/openllmetry-js/commit/c129aaec241b4a87f931c2da0774fed96c5c8068))

# [0.11.0](https://github.com/traceloop/openllmetry-js/compare/v0.10.0...v0.11.0) (2024-08-27)

### Bug Fixes

- include dist .mjs for packages with modules declared ([#425](https://github.com/traceloop/openllmetry-js/issues/425)) ([4a7ec33](https://github.com/traceloop/openllmetry-js/commit/4a7ec33ca5de6a1ad4ba6364bcff4fff8cb2b664))

# [0.10.0](https://github.com/traceloop/openllmetry-js/compare/v0.9.5...v0.10.0) (2024-08-01)

**Note:** Version bump only for package @traceloop/instrumentation-langchain

## [0.9.2](https://github.com/traceloop/openllmetry-js/compare/v0.9.1...v0.9.2) (2024-07-17)

### Bug Fixes

- added missing tslib dependency ([#369](https://github.com/traceloop/openllmetry-js/issues/369)) ([b20145d](https://github.com/traceloop/openllmetry-js/commit/b20145d13b391737febb5b57e4bc8c66b0f32b95))

# [0.9.0](https://github.com/traceloop/openllmetry-js/compare/v0.8.9...v0.9.0) (2024-07-04)

**Note:** Version bump only for package @traceloop/instrumentation-langchain

## [0.8.8](https://github.com/traceloop/openllmetry-js/compare/v0.8.7...v0.8.8) (2024-06-16)

**Note:** Version bump only for package @traceloop/instrumentation-langchain

## [0.8.6](https://github.com/traceloop/openllmetry-js/compare/v0.8.5...v0.8.6) (2024-06-03)

### Bug Fixes

- remove sentry; lower noise for instrumentation errors ([#294](https://github.com/traceloop/openllmetry-js/issues/294)) ([c4e3782](https://github.com/traceloop/openllmetry-js/commit/c4e37829ee40983b29831cb68b0343f993f0a33a))

# [0.8.0](https://github.com/traceloop/openllmetry-js/compare/v0.7.0...v0.8.0) (2024-04-29)

**Note:** Version bump only for package @traceloop/instrumentation-langchain

# [0.7.0](https://github.com/traceloop/openllmetry-js/compare/v0.6.1...v0.7.0) (2024-04-22)

**Note:** Version bump only for package @traceloop/instrumentation-langchain

## [0.6.1](https://github.com/traceloop/openllmetry-js/compare/v0.6.0...v0.6.1) (2024-04-22)

### Bug Fixes

- handle exceptions ([#214](https://github.com/traceloop/openllmetry-js/issues/214)) ([65f9be4](https://github.com/traceloop/openllmetry-js/commit/65f9be4fdcaa40f5bfd6c1fe3edc60910b4af894))

# [0.6.0](https://github.com/traceloop/openllmetry-js/compare/v0.5.29...v0.6.0) (2024-04-05)

**Note:** Version bump only for package @traceloop/instrumentation-langchain

## [0.5.29](https://github.com/traceloop/openllmetry-js/compare/v0.5.28...v0.5.29) (2024-04-03)

**Note:** Version bump only for package @traceloop/instrumentation-langchain

## [0.5.27](https://github.com/traceloop/openllmetry-js/compare/v0.5.26...v0.5.27) (2024-03-26)

**Note:** Version bump only for package @traceloop/instrumentation-langchain

## [0.5.24](https://github.com/traceloop/openllmetry-js/compare/v0.5.23...v0.5.24) (2024-03-15)

### Bug Fixes

- switch to rollup for all instrumentations ([#155](https://github.com/traceloop/openllmetry-js/issues/155)) ([605fb46](https://github.com/traceloop/openllmetry-js/commit/605fb46859dc2424fc933268122fb430cefda9ed))

## [0.5.23](https://github.com/traceloop/openllmetry-js/compare/v0.5.22...v0.5.23) (2024-03-15)

### Bug Fixes

- log instrumentation patching ([#148](https://github.com/traceloop/openllmetry-js/issues/148)) ([82d82bf](https://github.com/traceloop/openllmetry-js/commit/82d82bf563e950fe66f8e2fe64ce7bde3dba222b))
- only import types in all instrumentations ([#150](https://github.com/traceloop/openllmetry-js/issues/150)) ([7304563](https://github.com/traceloop/openllmetry-js/commit/7304563d9abcd5acfaeed7e16bea64a7245890c7))
- use correct versions from package.json ([#154](https://github.com/traceloop/openllmetry-js/issues/154)) ([a095fbc](https://github.com/traceloop/openllmetry-js/commit/a095fbcae3d45bd12a772a4e76ed93e64446e062))
