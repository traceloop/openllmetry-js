# OpenTelemetry MCP Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This library allows tracing of agentic workflows implemented with MCP (Model Context Protocol) framework using the [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk).

## Installation

```bash
npm install --save @traceloop/instrumentation-mcp
```

## Usage

```javascript
const { McpInstrumentation } = require('@traceloop/instrumentation-mcp');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

registerInstrumentations({
  instrumentations: [
    new McpInstrumentation(),
  ],
});
```

## Privacy

By default, this instrumentation logs prompts, completions, and embeddings to span attributes. This gives you a clear visibility into how your LLM application is working, and can make it easy to debug and evaluate the quality of the outputs.

However, you may want to disable this logging for privacy reasons, as they may contain highly sensitive data from your users. You may also want to disable this logging to reduce the size of your traces.

To disable logging, set the `traceContent` config option to `false`:

```javascript
const { McpInstrumentation } = require('@traceloop/instrumentation-mcp');

const mcpInstrumentation = new McpInstrumentation({
  traceContent: false,
});
```

## Instrumented Operations

This instrumentation tracks the following MCP operations:

### Client Operations
- Session lifecycle management
- Tool invocations
- Resource access
- Prompt templates
- MCP protocol methods

### Server Operations
- Request handling
- Tool execution
- Resource serving
- Server-side spans

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[npm-url]: https://www.npmjs.com/package/@traceloop/instrumentation-mcp
[npm-img]: https://badge.fury.io/js/%40traceloop%2Finstrumentation-mcp.svg
[license-url]: https://github.com/traceloop/openllmetry-js/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
