# OpenAI Instrumentation OTel 1.40 Migration — Review

Review of commits `24f24fe5`, `20e53cf1`, `29ae6ca4` on branch `feat-migrate-openai-semcov-1.40`.

Reference spec: [OTel GenAI Semconv v1.40](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)

---

## P1 — Must Fix

### 1. `gen_ai.response.id` is never set

**File:** `packages/instrumentation-openai/src/instrumentation.ts` lines 690-691

**Current behavior:** `_endSpan` sets `gen_ai.response.model` but never sets `gen_ai.response.id`, even though the response ID is available in both non-streaming responses (`result.id`) and is accumulated during streaming (`result.id = chunk.id` at line 465).

**Spec requirement:** `gen_ai.response.id` is Conditionally Required — "if available in the API response."

**Fix:** Import `ATTR_GEN_AI_RESPONSE_ID` from `@opentelemetry/semantic-conventions/incubating` and add this in `_endSpan` right after the `ATTR_GEN_AI_RESPONSE_MODEL` line:

```typescript
span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, result.id);
```

---

### 2. `buildOpenAIOutputMessage` fabricates `finish_reason: "stop"` when null/undefined

**File:** `packages/instrumentation-openai/src/message-helpers.ts` lines 279-281

**Current behavior:**

```typescript
const finishReason = choice.finish_reason
  ? (finishReasonMap[choice.finish_reason] ?? choice.finish_reason)
  : FinishReasons.STOP;  // <-- fabricates "stop"
```

When `choice.finish_reason` is `null` or `undefined`, the code defaults to `"stop"`. This means the output message JSON always contains a `finish_reason`, even when the API didn't provide one.

Note: The `_endSpan` code in `instrumentation.ts` (line 709-716) correctly skips setting the `finish_reasons` span attribute when the reason is falsy — but the output message JSON body still gets the fabricated `"stop"`.

Same issue exists in `buildOpenAICompletionOutputMessage` around line 300.

**Spec requirement:** When `stop_reason` is `null`/`undefined`, omit `finish_reason` from the output message JSON entirely. The spec says the field is optional.

**Fix:** Change both functions to conditionally include `finish_reason`:

```typescript
// In buildOpenAIOutputMessage:
const outputMsg: any = { role: "assistant", parts };
if (choice.finish_reason) {
  outputMsg.finish_reason =
    finishReasonMap[choice.finish_reason] ?? choice.finish_reason;
}
return [outputMsg];
```

Apply the same pattern to `buildOpenAICompletionOutputMessage`.

---

### 3. `OTelOutputMessage` type requires `finish_reason` — should be optional

**File:** `packages/instrumentation-openai/src/message-helpers.ts` lines 28-31

**Current behavior:**

```typescript
interface OTelOutputMessage {
  role: string;
  finish_reason: string;  // <-- required
  parts: object[];
}
```

This forces `finish_reason` to always be present, preventing the fix in item #2.

**Fix:**

```typescript
interface OTelOutputMessage {
  role: string;
  finish_reason?: string;  // optional
  parts: object[];
}
```

---

### 4. Audio `BlobPart` uses `content` instead of `data` (multiple locations)

The OTel BlobPart schema defines the field as `data`, not `content`:

```json
{"type": "blob", "modality": "audio", "mime_type": "audio/wav", "data": "<base64>"}
```

**Affected locations:**

1. **`packages/instrumentation-openai/src/message-helpers.ts` lines 271-276** — Output audio:
   ```typescript
   // WRONG:
   parts.push({
     type: "blob",
     modality: "audio",
     content: message.audio.data,  // should be `data`
   });
   ```

2. **`packages/instrumentation-utils/src/content-block-mappers.ts` ~line 193** — Input image data URI:
   ```typescript
   // WRONG:
   return {
     type: "blob",
     modality: "image",
     mime_type: match[1],
     content: match[2],  // should be `data`
   };
   ```

3. **`packages/instrumentation-utils/src/content-block-mappers.ts` ~line 204** — Input audio:
   ```typescript
   // WRONG:
   return {
     type: "blob",
     modality: "audio",
     mime_type: `audio/${block.input_audio?.format || "wav"}`,
     content: block.input_audio?.data,  // should be `data`
   };
   ```

**Fix:** Rename `content` to `data` in all three locations.

---

### 5. Audio `BlobPart` in output message is missing `mime_type`

**File:** `packages/instrumentation-openai/src/message-helpers.ts` lines 271-276

**Current behavior:**

```typescript
parts.push({
  type: "blob",
  modality: "audio",
  content: message.audio.data,
  // missing: mime_type
});
```

**Spec requirement:** `BlobPart` requires `mime_type: string`.

**Fix:** Add `mime_type`. OpenAI audio responses use the format requested in `audio.format` (defaults to `"mp3"`). If the format isn't available at this point, use a sensible default:

```typescript
parts.push({
  type: "blob",
  modality: "audio",
  mime_type: "audio/mp3",  // or derive from response format
  data: message.audio.data,
});
```

---

## P2 — Should Fix

### 6. Tool/function definitions still use legacy indexed attributes

**File:** `packages/instrumentation-openai/src/instrumentation.ts` lines 386-404

**Current behavior:** Functions and tools are set as individual indexed attributes:

```typescript
params.functions?.forEach((func, index) => {
  attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.name`] = func.name;
  attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.description`] = func.description;
  attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.arguments`] = JSON.stringify(func.parameters);
});

params.tools?.forEach((tool, index) => {
  attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.name`] = tool.function.name;
  // ... same pattern
});
```

**Spec requirement:** OTel has `gen_ai.tool.definitions` as a single JSON string containing an array of tool definitions.

**Fix:** Replace the indexed attributes with a single JSON attribute. Build an array of tool definition objects and set:

```typescript
if (params.tools?.length || params.functions?.length) {
  const toolDefs: object[] = [];

  params.functions?.forEach((func) => {
    toolDefs.push({
      name: func.name,
      description: func.description,
      parameters: func.parameters,
    });
  });

  params.tools?.forEach((tool) => {
    if (tool.type === "function" && tool.function) {
      toolDefs.push({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      });
    }
  });

  attributes[SpanAttributes.GEN_AI_TOOL_DEFINITIONS] = JSON.stringify(toolDefs);
}
```

Check if `GEN_AI_TOOL_DEFINITIONS` exists in `@traceloop/ai-semantic-conventions` or if it needs to be added. Also check if there's an upstream `ATTR_GEN_AI_TOOL_DEFINITIONS` in `@opentelemetry/semantic-conventions/incubating`.

---

### 7. Image wrappers don't set `gen_ai.operation.name`

**File:** `packages/instrumentation-openai/src/image-wrappers.ts`

**Affected locations:**

- Image generation span (line ~428):
  ```typescript
  const span = tracer.startSpan("openai.images.generate", {
    kind: SpanKind.CLIENT,
    attributes: {
      [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
      "gen_ai.request.type": "image_generation",  // custom attr, not operation.name
    },
  });
  ```
- Image edit span (line ~487): same issue
- Image variation span (line ~554): same issue

**Spec requirement:** `gen_ai.operation.name` is Required on all GenAI spans.

**Fix:** Add `[ATTR_GEN_AI_OPERATION_NAME]: "image_generation"` (or whichever value fits — check if OTel has well-known values for image operations; if not, `"image_generation"` / `"image_edit"` are reasonable custom values). Import `ATTR_GEN_AI_OPERATION_NAME` in `image-wrappers.ts`.

---

### 8. Image output message hardcodes `finish_reason: "stop"`

**File:** `packages/instrumentation-openai/src/image-wrappers.ts` lines 383-388

**Current behavior:**

```typescript
attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] = JSON.stringify([
  {
    role: "assistant",
    finish_reason: "stop",  // fabricated — image API has no finish_reason
    parts: [{ type: "uri", modality: "image", uri: imageOutputUrl }],
  },
]);
```

**Spec requirement:** Omit `finish_reason` when the API doesn't provide one.

**Fix:** Remove the `finish_reason` field from the output message object.

---

### 9. Streaming chat accumulator initializes `finish_reason` to `"stop"` instead of `null`

**File:** `packages/instrumentation-openai/src/instrumentation.ts` line 452

**Current behavior:**

```typescript
const result: ChatCompletion = {
  // ...
  choices: [{
    index: 0,
    logprobs: null,
    finish_reason: "stop",  // <-- should be null
    message: { role: "assistant", content: "", tool_calls: [] } as any,
  }],
  // ...
};
```

If no `finish_reason` chunk arrives during streaming, the default `"stop"` silently passes through to `_endSpan`, which then maps and sets it as a span attribute. This masks missing data.

**Fix:** Initialize `finish_reason` to `null`:

```typescript
finish_reason: null as any,  // Will be set by chunk processing if present
```

The `_endSpan` code already handles null correctly (line 709: `if (finishReason) { ... }`).

---

### 10. Only `choices[0]` is processed — multiple choices are dropped

**File:** `packages/instrumentation-openai/src/instrumentation.ts` lines 707-747

**Current behavior:** `_endSpan` only reads `result.choices[0]` for both finish reasons and output messages. If the API returns `n > 1` choices, all others are silently dropped.

**Spec note:** `gen_ai.response.finish_reasons` is specifically typed as `string[]` to hold multiple finish reasons (one per choice). Similarly, `gen_ai.output.messages` is an array.

**Fix (lower priority):** Loop over all choices:

```typescript
const finishReasons = result.choices
  .map(c => c.finish_reason)
  .filter(Boolean)
  .map(r => openaiFinishReasonMap[r] ?? r);
if (finishReasons.length) {
  span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, finishReasons);
}

if (this._shouldSendPrompts()) {
  const outputMessages = result.choices.map(choice =>
    buildOpenAIOutputMessage(choice, openaiFinishReasonMap)[0]
  );
  span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, JSON.stringify(outputMessages));
}
```

This is lower priority since `n=1` is the overwhelmingly common case.

---

### 11. Image edit puts prompt and image in two separate user messages instead of one (FIXED)

**File:** `packages/instrumentation-openai/src/image-wrappers.ts` lines 206-238

**Was:** The prompt created one `{role: "user"}` message, then the image was pushed as a second `{role: "user"}` message:

```json
[
  {"role": "user", "parts": [{"type": "text", "content": "Add a red hat"}]},
  {"role": "user", "parts": [{"type": "uri", "modality": "image", "uri": "..."}]}
]
```

**Should be:** A single message with two parts:

```json
[
  {
    "role": "user",
    "parts": [
      {"type": "text", "content": "Add a red hat"},
      {"type": "uri", "modality": "image", "uri": "..."}
    ]
  }
]
```

**Fix applied:** Changed to append the image URI part to the existing user message's `parts` array instead of pushing a new message.

---

## P3 — Nice to Have

### 12. Image span names don't follow `{operation} {model}` format (FIXED)

**File:** `packages/instrumentation-openai/src/image-wrappers.ts` lines 426, 486, 554

**Was:** `"openai.images.generate"`, `"openai.images.edit"`, `"openai.images.createVariation"`

**Should be:** `"image_generation dall-e-2"`, `"image_edit dall-e-2"`, `"image_variation dall-e-2"` (matching the `{operation_name} {model}` pattern used for chat/completion spans).

**Fix applied:** Changed all three span names to use `` `${operation} ${params.model || "dall-e-2"}` `` format. Tests updated to match with `startsWith`.

---

### 13. `mapOpenAIContentBlock` file with `file_data` maps to wrong part type

**File:** `packages/instrumentation-utils/src/content-block-mappers.ts` lines 230-234

**Current behavior:** Inline file data is mapped as:

```typescript
return {
  type: "file",
  content: block.file.file_data,
  ...(block.file.filename && { filename: block.file.filename }),
};
```

**Issue:** OTel `FilePart` only has `file_id` — it's a reference type, not a data carrier. Inline data should be a `BlobPart`.

**Fix:**

```typescript
return {
  type: "blob",
  mime_type: block.file.mime_type || "application/octet-stream",
  data: block.file.file_data,
};
```

---

### 14. `"openrouter"` provider is a hardcoded string

**File:** `packages/instrumentation-openai/src/instrumentation.ts` line 853

```typescript
return { provider: "openrouter" };
```

OpenRouter isn't in the OTel well-known provider list, so there's no upstream constant. The lowercase string is fine, but it should get a comment explaining why it's not a constant.

---

### 15. Test coverage gaps

The following test scenarios are missing and should be added:

1. **Unit tests for `mapOpenAIContentBlock`** — Cover all block types: `text`, `image_url` (regular URL), `image_url` (data URI), `input_audio`, `file` (file_id), `file` (file_data), `refusal`, unknown/fallback
2. **Unit tests for `buildOpenAIInputMessages`** — Cover all role types: `system`, `developer`, `user` (string and array content), `assistant` (with tool_calls, with function_call), `tool`, `function` (deprecated), unknown role
3. **Unit tests for `buildOpenAIOutputMessage`** — Cover: text content, refusal, tool_calls, audio, deprecated function_call, null finish_reason (after P1 fix)
4. **Test for `traceContent: false` still recording `finish_reasons`** — Verify that `gen_ai.response.finish_reasons` is set even when prompts are suppressed, while `gen_ai.input.messages` and `gen_ai.output.messages` are absent
5. **Streaming finish_reasons test** — Verify finish reason is correctly captured from streaming chunks
6. **`openai.beta.chat.completions.stream` test** — The old test was removed (was previously `.skip`), needs a replacement or explicit documentation of why it's excluded

---

## Notes — Correct / Acceptable

- **System/developer messages stay in `gen_ai.input.messages`**: Correct per OTel spec note [17] — OpenAI puts system messages in the chat history, not as a separate parameter, so they belong in `gen_ai.input.messages` (not `gen_ai.system_instructions`)
- **`modelVendor` removed from `_detectVendorFromURL`**: Good cleanup — it was unused
- **Provider name values corrected**: `"OpenAI"` -> `"openai"`, `"Azure"` -> `"azure.ai.openai"`, `"AWS"` -> `"aws.bedrock"`, `"Google"` -> `"gcp.vertex_ai"` — all match OTel well-known values
- **Version range bumped to `>=4 <7`**: Correct for OpenAI SDK v6 support
- **`@opentelemetry/semantic-conventions` bumped to `^1.40.0`**: Required for new upstream constants
- **Span naming changed to `{operation} {model}`**: Matches the spec pattern (e.g., `"chat gpt-4"`)
- **`finish_reasons` set outside `_shouldSendPrompts()` gate**: Correct — finish reasons are metadata, not user content

---

## Gateway Impact (Awareness Only — NOT blocking)

These are downstream observations, not issues to fix in this PR:

1. **New JSON format vs. indexed attributes**: The SDK now emits `gen_ai.input.messages` / `gen_ai.output.messages` as JSON with `{role, parts}` structure. Old SDKs emit `gen_ai.prompt.{i}.*` / `gen_ai.completion.{i}.*` indexed attrs. The gateway's `buildMessagesJSON()` converts old indexed attrs to JSON, but the resulting shape may differ from the new SDK's parts-based format. Storage queries may need to handle both schemas.

2. **Provider name value changes**: Old SDK emitted capitalized values (`"OpenAI"`, `"Azure"`, `"AWS"`, `"Google"`). New SDK emits OTel well-known values (`"openai"`, `"azure.ai.openai"`, `"aws.bedrock"`, `"gcp.vertex_ai"`). The gateway does key renames only, not value transforms, so old SDKs will continue emitting the old values. Dashboards/queries filtering on provider name may need to handle both.

3. **Finish reason in old indexed format**: The gateway's `buildMessagesJSON()` defaults missing `finish_reason` to `"stop"` for old indexed completions. New SDK (after P1 fix #2) will omit it. This creates silent data divergence in storage.
