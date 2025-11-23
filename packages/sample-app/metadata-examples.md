# Vercel AI SDK Metadata Examples

This document demonstrates various ways to pass metadata when using the Vercel AI SDK.

## 1. Via Experimental Telemetry (Recommended)

```typescript
await generateText({
  model: openai("gpt-4o"),
  messages: [...],
  experimental_telemetry: {
    isEnabled: true,
    functionId: "my_agent_session_123", // Custom identifier
    metadata: {
      sessionId: "session_abc123",
      userId: "user_456",
      feature: "research_agent",
      version: "1.0.0",
    },
  },
});
```

## 2. Via System Message Context

```typescript
const systemMessage = {
  role: "system",
  content: `You are an AI assistant.

Session ID: ${sessionId}
User ID: ${userId}
Context: ${contextInfo}
Timestamp: ${new Date().toISOString()}`,
};
```

## 3. Via Custom Tool Metadata

```typescript
const customTool = tool({
  description: "A tool with metadata",
  parameters: z.object({
    query: z.string(),
  }),
  execute: async ({ query }, { metadata }) => {
    // Access metadata passed from generateText call
    console.log("Tool metadata:", metadata);
    return { result: "processed" };
  },
});
```

## 4. Via Traceloop Workflow Metadata

```typescript
await traceloop.withWorkflow(
  { name: "agent_request" },
  async () => {
    // Your AI SDK calls here
    return await generateText({...});
  },
  {
    // Metadata passed to Traceloop for observability
    sessionId,
    userId,
    requestType: "agent_interaction"
  }
);
```

## 5. Via Provider Configuration (OpenAI)

```typescript
// This approach may vary by provider and SDK version
const model = openai("gpt-4o", {
  // Some providers support custom headers or configuration
  // Check your specific provider documentation
});
```

## Best Practices

1. **Use experimental_telemetry for observability metadata**
2. **Include context in system messages for model awareness**
3. **Pass structured metadata to Traceloop workflows**
4. **Use consistent metadata keys across your application**
5. **Include session/user identifiers for tracking**
6. **Add timestamps for debugging and analytics**
