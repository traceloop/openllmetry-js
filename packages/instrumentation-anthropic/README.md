# OpenTelemetry Anthropic instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`Anthropic Typescript SDK`](https://github.com/anthropics/anthropic-sdk-typescript) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@traceloop/node-server-sdk`](https://www.npmjs.com/package/@traceloop/node-server-sdk) bundle.

If total installation size is not constrained, it is recommended to use the [`@traceloop/node-server-sdk`](https://www.npmjs.com/package/@traceloop/node-server-sdk) bundle for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @traceloop/instrumentation-anthropic
```

## Supported Versions

- `>=0.9.1`

## Usage

To load a specific plugin, specify it in the registerInstrumentations's configuration:

```js
const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
const {
  AnthropicInstrumentation,
} = require("@traceloop/instrumentation-anthropic");
const { registerInstrumentations } = require("@opentelemetry/instrumentation");

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [new AnthropicInstrumentation()],
});
```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us on [Slack][slack-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[slack-url]: https://traceloop.com/slack
[license-url]: https://github.com/traceloop/openllmetry-js/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@traceloop/instrumentation-anthropic
[npm-img]: https://badge.fury.io/js/%40traceloop%2Finstrumentation-anthropic.svg
