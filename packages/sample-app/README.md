# Experiment Sample Application

This sample app demonstrates the new experiment functionality in OpenLLMetry-JS SDK.

## 🚀 Quick Start

### Prerequisites
- Node.js >= 14
- pnpm

### Setup
1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

2. Fill in your API keys in `.env`:
   ```bash
   TRACELOOP_API_KEY=your_traceloop_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. Build and run:
   ```bash
   # Run JSONL parsing tests (no API keys required)
   npm run run:experiment_test

   # Run experiment example (requires API keys)
   npm run run:experiment
   ```

## 🧪 Experiment Features Implemented

### Core Components
- **Experiment Client**: `client.experiment.run(taskFunction, options)`
- **Evaluator Client**: `client.evaluator.runExperimentEvaluator(...)`
- **SSE Streaming**: Real-time progress updates via Server-Sent Events
- **Dataset Integration**: Works with existing dataset functionality
- **JSONL Support**: Parse dataset versions in JSONL format

### Example Usage
```typescript
import * as traceloop from "@traceloop/node-server-sdk";

traceloop.initialize({ apiKey: "your-key", appName: "my-app" });
const client = traceloop.getClient();

// Define your experiment task
const myTask: ExperimentTaskFunction = async (input) => {
  // Your task logic here
  return { result: "processed", input };
};

// Run experiment
const results = await client.experiment.run(myTask, {
  datasetSlug: "my-dataset",
  datasetVersion: "v1",
  evaluators: [{ name: "accuracy" }],
  experimentSlug: "my-experiment",
  stopOnError: false,
  waitForResults: true,
  concurrency: 3
});

console.log(\`Results: \${results.results.length}\`);
console.log(\`Errors: \${results.errors.length}\`);
```

## 🐛 Debug Configuration

### VS Code Debugging
Three debug configurations are available:

1. **Debug Experiment Example**: Full debug with real API calls
2. **Debug Simple Experiment Test**: Debug the JSONL parsing tests
3. **Debug Experiment Example (Mock Mode)**: Debug with mocked API responses

### Environment Variables
- \`MOCK_MODE=true\`: Enable mock responses for debugging without API keys
- \`DEBUG=traceloop:*\`: Enable debug logging
- \`OTEL_LOG_LEVEL=debug\`: Enable OpenTelemetry debug logs

### Running in Mock Mode
```bash
MOCK_MODE=true npm run run:experiment
```

## 📁 Files Structure

- \`src/experiment_example.ts\`: Main experiment demonstration
- \`src/medical_prompts.ts\`: Example prompt templates for healthcare experiments
- \`src/simple_experiment_test.ts\`: JSONL parsing tests
- \`.vscode/launch.json\`: Debug configurations
- \`.vscode/tasks.json\`: Build and run tasks

## 🔧 Available Scripts

- \`npm run build\`: Build TypeScript
- \`npm run run:experiment\`: Run experiment example
- \`npm run run:experiment_test\`: Run JSONL parsing tests
- \`npm run lint\`: Run ESLint
- \`npm run lint:fix\`: Fix ESLint issues

## 📊 Experiment Types Demonstrated

### Medical Question Experiments
- **Refuse Advice Strategy**: Redirects users to medical professionals
- **Provide Info Strategy**: Educational responses with disclaimers
- **Comparison**: Side-by-side evaluation of different approaches

### Sentiment Analysis Experiment  
- **Task**: Analyze text sentiment
- **Evaluators**: Accuracy and confidence calibration
- **Concurrency**: Demonstrates parallel processing

## 🔗 Integration Points

The experiment feature integrates with:
- **Existing Dataset API**: Uses \`client.datasets.get()\`
- **TraceloopClient**: Available as \`client.experiment\`
- **OpenTelemetry**: All experiments are traced
- **Error Handling**: Configurable error propagation
- **Type Safety**: Full TypeScript support