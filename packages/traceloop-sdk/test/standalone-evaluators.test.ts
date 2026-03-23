import * as assert from "assert";
import * as traceloop from "../src";

let client: traceloop.TraceloopClient;

describe("StandaloneEvaluators", () => {
  let originalFetch: typeof global.fetch;

  before(() => {
    originalFetch = global.fetch;
    client = new traceloop.TraceloopClient({
      appName: "test_standalone_evaluators",
      apiKey: "test-key",
      baseUrl: "https://api.traceloop.com",
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe("create", () => {
    it("should POST to /v2/evaluators and return id and slug", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;
      let capturedBody: string | undefined;

      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = input.toString();
        capturedMethod = init?.method;
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({ evaluatorId: "eval-123", slug: "quality-judge" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      const result = await client.evaluator.create({
        name: "Quality Judge",
        messages: [{ role: "user", content: "Is this good? {{text}}" }],
        provider: "openai",
        model: "gpt-4o",
        inputSchema: [{ name: "text", type: "string" }],
        outputSchema: [{ name: "result", type: "boolean" }],
      });

      assert.strictEqual(
        capturedUrl,
        "https://api.traceloop.com/v2/evaluators",
      );
      assert.strictEqual(capturedMethod, "POST");
      assert.strictEqual(result.id, "eval-123");
      assert.strictEqual(result.slug, "quality-judge");

      const body = JSON.parse(capturedBody!);
      assert.strictEqual(body.name, "Quality Judge");
      assert.strictEqual(body.provider, "openai");
      assert.strictEqual(body.model, "gpt-4o");
      assert.deepStrictEqual(body.messages, [
        { role: "user", content: "Is this good? {{text}}" },
      ]);
      assert.deepStrictEqual(body.input_schema, [
        { name: "text", type: "string" },
      ]);
      assert.deepStrictEqual(body.output_schema, [
        { name: "result", type: "boolean" },
      ]);
    });

    it("should send enum_values when schema has enumValues", async () => {
      let capturedBody: string | undefined;

      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({ evaluatorId: "eval-123", slug: "label-judge" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      await client.evaluator.create({
        name: "Label Judge",
        messages: [{ role: "user", content: "Classify: {{text}}" }],
        provider: "openai",
        model: "gpt-4o",
        inputSchema: [{ name: "text", type: "string" }],
        outputSchema: [
          {
            name: "label",
            type: "enum",
            enumValues: ["good", "bad", "neutral"],
          },
        ],
      });

      const body = JSON.parse(capturedBody!);
      assert.deepStrictEqual(body.output_schema, [
        {
          name: "label",
          type: "enum",
          enum_values: ["good", "bad", "neutral"],
        },
      ]);
    });

    it("should not include slug in body when not provided", async () => {
      let capturedBody: string | undefined;

      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({ evaluatorId: "eval-123", slug: "auto-slug" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      await client.evaluator.create({
        name: "My Eval",
        messages: [{ role: "user", content: "Evaluate." }],
        provider: "openai",
        model: "gpt-4o",
        inputSchema: [{ name: "text", type: "string" }],
        outputSchema: [{ name: "result", type: "boolean" }],
      });

      const body = JSON.parse(capturedBody!);
      assert.strictEqual("slug" in body, false);
    });

    it("should include optional fields when provided", async () => {
      let capturedBody: string | undefined;

      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({ evaluatorId: "eval-456", slug: "my-eval" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      await client.evaluator.create({
        name: "My Eval",
        slug: "my-eval",
        description: "A custom judge",
        messages: [{ role: "system", content: "Judge this." }],
        provider: "openai",
        model: "gpt-4o-mini",
        inputSchema: [{ name: "text", type: "string" }],
        outputSchema: [{ name: "score", type: "number" }],
        temperature: 0.5,
        maxTokens: 512,
        topP: 0.9,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
      });

      const body = JSON.parse(capturedBody!);
      assert.strictEqual(body.slug, "my-eval");
      assert.strictEqual(body.description, "A custom judge");
      assert.strictEqual(body.temperature, 0.5);
      assert.strictEqual(body.max_tokens, 512);
      assert.strictEqual(body.top_p, 0.9);
      assert.strictEqual(body.frequency_penalty, 0.1);
      assert.strictEqual(body.presence_penalty, 0.2);
    });

    it("should include auth headers", async () => {
      let capturedHeaders: HeadersInit | undefined;

      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = init?.headers;
        return new Response(
          JSON.stringify({ evaluatorId: "eval-789", slug: "my-eval" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      await client.evaluator.create({
        name: "My Eval",
        messages: [{ role: "user", content: "Evaluate." }],
        provider: "openai",
        model: "gpt-4o",
        inputSchema: [{ name: "text", type: "string" }],
        outputSchema: [{ name: "result", type: "boolean" }],
      });

      const headers = capturedHeaders as Record<string, string>;
      assert.strictEqual(headers["Authorization"], "Bearer test-key");
      assert.strictEqual(headers["Content-Type"], "application/json");
      assert.ok(headers["X-Traceloop-SDK-Version"]);
    });
  });

  // ─── list ────────────────────────────────────────────────────────────────────

  describe("list", () => {
    it("should GET /v2/evaluators and return mapped evaluators", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;

      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = input.toString();
        capturedMethod = init?.method;
        return new Response(
          JSON.stringify({
            evaluators: [
              {
                id: "eval-1",
                slug: "my-judge",
                name: "My Judge",
                description: "A judge",
                source: "custom",
                inputSchema: [{ name: "text", type: "string" }],
                outputSchema: [{ name: "result", type: "boolean" }],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      const result = await client.evaluator.list();

      assert.strictEqual(
        capturedUrl,
        "https://api.traceloop.com/v2/evaluators",
      );
      assert.strictEqual(capturedMethod, "GET");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, "eval-1");
      assert.strictEqual(result[0].slug, "my-judge");
      assert.strictEqual(result[0].name, "My Judge");
      assert.strictEqual(result[0].source, "custom");
    });

    it("should filter by source=custom when specified", async () => {
      let capturedUrl: string | undefined;

      global.fetch = (async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(JSON.stringify({ evaluators: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof global.fetch;

      await client.evaluator.list("custom");

      assert.strictEqual(
        capturedUrl,
        "https://api.traceloop.com/v2/evaluators?source=custom",
      );
    });

    it("should filter by source=prebuilt when specified", async () => {
      let capturedUrl: string | undefined;

      global.fetch = (async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(JSON.stringify({ evaluators: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof global.fetch;

      await client.evaluator.list("prebuilt");

      assert.strictEqual(
        capturedUrl,
        "https://api.traceloop.com/v2/evaluators?source=prebuilt",
      );
    });

    it("should return empty array when no evaluators", async () => {
      global.fetch = (async () =>
        new Response(JSON.stringify({ evaluators: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as typeof global.fetch;

      const result = await client.evaluator.list();
      assert.deepStrictEqual(result, []);
    });

    it("should map all evaluators when multiple are returned", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            evaluators: [
              {
                id: "eval-1",
                slug: "judge-a",
                name: "Judge A",
                description: "First judge",
                source: "custom",
                inputSchema: [{ name: "text", type: "string" }],
                outputSchema: [{ name: "result", type: "boolean" }],
              },
              {
                id: "eval-2",
                slug: "judge-b",
                name: "Judge B",
                description: "Second judge",
                source: "prebuilt",
                inputSchema: [],
                outputSchema: [],
              },
              {
                id: "eval-3",
                slug: "judge-c",
                name: "Judge C",
                description: "Third judge",
                source: "custom",
                inputSchema: [],
                outputSchema: [],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof global.fetch;

      const result = await client.evaluator.list();

      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].id, "eval-1");
      assert.strictEqual(result[1].id, "eval-2");
      assert.strictEqual(result[2].id, "eval-3");
      assert.strictEqual(result[1].source, "prebuilt");
    });

    it("should map inputSchema and outputSchema from response", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            evaluators: [
              {
                id: "eval-1",
                slug: "judge-a",
                name: "Judge A",
                description: "A judge",
                source: "custom",
                input_schema: [{ name: "text", type: "string" }],
                output_schema: [
                  { name: "label", type: "enum", enum_values: ["good", "bad"] },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof global.fetch;

      const result = await client.evaluator.list();

      assert.strictEqual(result[0].inputSchema.length, 1);
      assert.strictEqual(result[0].inputSchema[0].name, "text");
      assert.strictEqual(result[0].inputSchema[0].type, "string");
      assert.strictEqual(result[0].outputSchema.length, 1);
      assert.strictEqual(result[0].outputSchema[0].name, "label");
    });

    it("should default inputSchema and outputSchema to [] when missing from response", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            evaluators: [
              {
                id: "eval-1",
                slug: "judge-a",
                name: "Judge A",
                description: "",
                source: "prebuilt",
                // inputSchema and outputSchema intentionally absent
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof global.fetch;

      const result = await client.evaluator.list();

      assert.deepStrictEqual(result[0].inputSchema, []);
      assert.deepStrictEqual(result[0].outputSchema, []);
    });

    it("should default description to empty string when missing", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            evaluators: [
              {
                id: "eval-1",
                slug: "judge-a",
                name: "Judge A",
                // description is missing
                source: "custom",
                inputSchema: [],
                outputSchema: [],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof global.fetch;

      const result = await client.evaluator.list();
      assert.strictEqual(result[0].description, "");
    });

    it("should throw when list returns non-200 status", async () => {
      global.fetch = (async () =>
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        })) as typeof global.fetch;

      await assert.rejects(() => client.evaluator.list());
    });
  });

  // ─── get ─────────────────────────────────────────────────────────────────────

  describe("get", () => {
    it("should GET /v2/evaluators/:id and return full details", async () => {
      let capturedUrl: string | undefined;

      global.fetch = (async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(
          JSON.stringify({
            id: "eval-123",
            slug: "quality-judge",
            name: "Quality Judge",
            description: "A quality judge",
            source: "custom",
            inputSchema: [{ name: "text", type: "string" }],
            outputSchema: [{ name: "result", type: "boolean" }],
            config: {
              provider: "openai",
              messages: [{ role: "user", content: "Is this good?" }],
              llmConfig: {
                model: "gpt-4o",
                temperature: 0.7,
                maxTokens: 1024,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      const result = await client.evaluator.get("eval-123");

      assert.strictEqual(
        capturedUrl,
        "https://api.traceloop.com/v2/evaluators/eval-123",
      );
      assert.strictEqual(result.id, "eval-123");
      assert.strictEqual(result.slug, "quality-judge");
      assert.strictEqual(result.provider, "openai");
      assert.strictEqual(result.model, "gpt-4o");
      assert.strictEqual(result.temperature, 0.7);
      assert.strictEqual(result.maxTokens, 1024);
      assert.deepStrictEqual(result.messages, [
        { role: "user", content: "Is this good?" },
      ]);
    });

    it("should work with slug as identifier", async () => {
      let capturedUrl: string | undefined;

      global.fetch = (async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(
          JSON.stringify({
            id: "eval-123",
            slug: "quality-judge",
            name: "Quality Judge",
            description: "",
            source: "custom",
            inputSchema: [],
            outputSchema: [],
            config: {
              provider: "openai",
              messages: [],
              llmConfig: { model: "gpt-4o" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      await client.evaluator.get("quality-judge");

      assert.strictEqual(
        capturedUrl,
        "https://api.traceloop.com/v2/evaluators/quality-judge",
      );
    });

    it("should throw when provider is missing from config", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            id: "eval-123",
            slug: "quality-judge",
            name: "Quality Judge",
            description: "",
            source: "custom",
            inputSchema: [],
            outputSchema: [],
            config: {
              // provider is missing
              messages: [],
              llmConfig: { model: "gpt-4o" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof global.fetch;

      await assert.rejects(
        () => client.evaluator.get("eval-123"),
        /missing required field: provider/,
      );
    });

    it("should throw when model is missing from llmConfig", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            id: "eval-123",
            slug: "quality-judge",
            name: "Quality Judge",
            description: "",
            source: "custom",
            inputSchema: [],
            outputSchema: [],
            config: {
              provider: "openai",
              messages: [],
              llmConfig: {
                // model is missing
                temperature: 0.7,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof global.fetch;

      await assert.rejects(
        () => client.evaluator.get("eval-123"),
        /missing required field: model/,
      );
    });

    it("should return all optional LLM params when present", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            id: "eval-123",
            slug: "my-eval",
            name: "My Eval",
            description: "",
            source: "custom",
            inputSchema: [],
            outputSchema: [],
            config: {
              provider: "openai",
              messages: [],
              llmConfig: {
                model: "gpt-4o",
                temperature: 0.5,
                maxTokens: 512,
                topP: 0.9,
                frequencyPenalty: 0.1,
                presencePenalty: 0.2,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof global.fetch;

      const result = await client.evaluator.get("eval-123");

      assert.strictEqual(result.temperature, 0.5);
      assert.strictEqual(result.maxTokens, 512);
      assert.strictEqual(result.topP, 0.9);
      assert.strictEqual(result.frequencyPenalty, 0.1);
      assert.strictEqual(result.presencePenalty, 0.2);
    });

    it("should map enum values in schema back to enumValues", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            id: "eval-123",
            slug: "label-judge",
            name: "Label Judge",
            description: "",
            source: "custom",
            input_schema: [{ name: "text", type: "string" }],
            output_schema: [
              { name: "label", type: "enum", enum_values: ["good", "bad"] },
            ],
            config: {
              provider: "openai",
              messages: [],
              llmConfig: { model: "gpt-4o" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof global.fetch;

      const result = await client.evaluator.get("eval-123");

      assert.strictEqual(result.outputSchema[0].name, "label");
      assert.strictEqual(result.outputSchema[0].type, "enum");
      assert.deepStrictEqual(result.outputSchema[0].enumValues, [
        "good",
        "bad",
      ]);
    });

    it("should preserve zero LLM params and omit undefined ones", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            id: "eval-123",
            slug: "my-eval",
            name: "My Eval",
            description: "",
            source: "custom",
            inputSchema: [],
            outputSchema: [],
            config: {
              provider: "openai",
              messages: [],
              llmConfig: {
                model: "gpt-4o",
                temperature: 0,
                maxTokens: 0,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof global.fetch;

      const result = await client.evaluator.get("eval-123");

      // temperature=0 and maxTokens=0 are defined and must be preserved
      assert.strictEqual(result.temperature, 0);
      assert.strictEqual(result.maxTokens, 0);
      // topP, frequencyPenalty, presencePenalty are absent → undefined
      assert.strictEqual(result.topP, undefined);
      assert.strictEqual(result.frequencyPenalty, undefined);
      assert.strictEqual(result.presencePenalty, undefined);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe("update", () => {
    it("should PATCH /v2/evaluators/:id and return updated id", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;
      let capturedBody: string | undefined;

      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = input.toString();
        capturedMethod = init?.method;
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({ evaluator: { id: "eval-123" }, versions: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      const result = await client.evaluator.update("eval-123", {
        name: "Updated Name",
        model: "gpt-4o-mini",
      });

      assert.strictEqual(
        capturedUrl,
        "https://api.traceloop.com/v2/evaluators/eval-123",
      );
      assert.strictEqual(capturedMethod, "PATCH");
      assert.strictEqual(result.id, "eval-123");

      const body = JSON.parse(capturedBody!);
      assert.strictEqual(body.name, "Updated Name");
      assert.strictEqual(body.config.llm_config.model, "gpt-4o-mini");
    });

    it("should only send fields that are provided", async () => {
      let capturedBody: string | undefined;

      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({ evaluator: { id: "eval-123" }, versions: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      // Only updating temperature — nothing else
      await client.evaluator.update("eval-123", { temperature: 0.3 });

      const body = JSON.parse(capturedBody!);
      assert.strictEqual(body.config.llm_config.temperature, 0.3);
      assert.strictEqual(body.name, undefined);
      assert.strictEqual(body.config.llm_config.model, undefined);
      assert.strictEqual(body.config.provider, undefined);
    });

    it("should map inputSchema and outputSchema to snake_case", async () => {
      let capturedBody: string | undefined;

      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(JSON.stringify({ evaluatorId: "eval-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof global.fetch;

      await client.evaluator.update("eval-123", {
        inputSchema: [
          {
            name: "text",
            type: "string",
            description: "Input text",
            enumValues: ["a", "b"],
          },
        ],
        outputSchema: [{ name: "result", type: "boolean" }],
      });

      const body = JSON.parse(capturedBody!);
      assert.deepStrictEqual(body.input_schema, [
        {
          name: "text",
          type: "string",
          description: "Input text",
          enum_values: ["a", "b"],
        },
      ]);
      assert.deepStrictEqual(body.output_schema, [
        { name: "result", type: "boolean" },
      ]);
    });

    it("should work with slug as identifier", async () => {
      let capturedUrl: string | undefined;

      global.fetch = (async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(JSON.stringify({ evaluatorId: "eval-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof global.fetch;

      await client.evaluator.update("quality-judge", { name: "New Name" });

      assert.strictEqual(
        capturedUrl,
        "https://api.traceloop.com/v2/evaluators/quality-judge",
      );
    });

    it("should correctly serialize messages update", async () => {
      let capturedBody: string | undefined;

      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({ evaluator: { id: "eval-123" }, versions: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      await client.evaluator.update("eval-123", {
        messages: [
          { role: "system", content: "You are a strict judge." },
          { role: "user", content: "Evaluate: {{text}}" },
        ],
      });

      const body = JSON.parse(capturedBody!);
      assert.deepStrictEqual(body.config.messages, [
        { role: "system", content: "You are a strict judge." },
        { role: "user", content: "Evaluate: {{text}}" },
      ]);
      // Nothing else should be sent
      assert.strictEqual(body.name, undefined);
      assert.strictEqual(body.config.llm_config, undefined);
    });

    it("should use correct snake_case keys for all LLM params", async () => {
      let capturedBody: string | undefined;

      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({ evaluator: { id: "eval-123" }, versions: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      await client.evaluator.update("eval-123", {
        maxTokens: 1024,
        topP: 0.8,
        frequencyPenalty: 0.3,
        presencePenalty: 0.4,
      });

      const body = JSON.parse(capturedBody!);
      assert.strictEqual(body.config.llm_config.max_tokens, 1024);
      assert.strictEqual(body.config.llm_config.top_p, 0.8);
      assert.strictEqual(body.config.llm_config.frequency_penalty, 0.3);
      assert.strictEqual(body.config.llm_config.presence_penalty, 0.4);
      // camelCase keys must NOT appear
      assert.strictEqual(body.config.llm_config.maxTokens, undefined);
      assert.strictEqual(body.config.llm_config.topP, undefined);
      assert.strictEqual(body.config.llm_config.frequencyPenalty, undefined);
      assert.strictEqual(body.config.llm_config.presencePenalty, undefined);
    });

    it("should send PATCH (not PUT) — no GET before update", async () => {
      const calledMethods: string[] = [];

      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        calledMethods.push(init?.method ?? "GET");
        return new Response(JSON.stringify({ evaluatorId: "eval-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof global.fetch;

      await client.evaluator.update("eval-123", { name: "New Name" });

      assert.strictEqual(
        calledMethods.length,
        1,
        "Should make exactly one request",
      );
      assert.strictEqual(calledMethods[0], "PATCH");
    });
  });

  // ─── run ─────────────────────────────────────────────────────────────────────

  describe("run", () => {
    it("should POST to /v2/evaluators/:id/executions and return result", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;
      let capturedBody: string | undefined;

      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = input.toString();
        capturedMethod = init?.method;
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({
            executionId: "exec-abc",
            result: { score: 0.95, label: "good" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      const result = await client.evaluator.run("eval-123", {
        input: { text: "This is a great response!" },
      });

      assert.strictEqual(
        capturedUrl,
        "https://api.traceloop.com/v2/evaluators/eval-123/executions",
      );
      assert.strictEqual(capturedMethod, "POST");
      assert.strictEqual(result.executionId, "exec-abc");
      assert.deepStrictEqual(result.result, {
        executionId: "exec-abc",
        result: { score: 0.95, label: "good" },
      });

      const body = JSON.parse(capturedBody!);
      assert.deepStrictEqual(body.input, { text: "This is a great response!" });
    });

    it("should work with slug as identifier", async () => {
      let capturedUrl: string | undefined;

      global.fetch = (async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(
          JSON.stringify({ executionId: "exec-xyz", result: true }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      await client.evaluator.run("quality-judge", {
        input: { text: "Hello" },
      });

      assert.strictEqual(
        capturedUrl,
        "https://api.traceloop.com/v2/evaluators/quality-judge/executions",
      );
    });

    it("should handle boolean primitive result", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({ executionId: "exec-abc", result: true }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof global.fetch;

      const result = await client.evaluator.run("eval-123", {
        input: { text: "Great response" },
      });

      assert.deepStrictEqual(result.result, {
        executionId: "exec-abc",
        result: true,
      });
    });

    it("should handle numeric score result", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({ executionId: "exec-abc", result: 0.87 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof global.fetch;

      const result = await client.evaluator.run("eval-123", {
        input: { text: "Pretty good" },
      });

      assert.deepStrictEqual(result.result, {
        executionId: "exec-abc",
        result: 0.87,
      });
    });

    it("should handle empty input object", async () => {
      let capturedBody: string | undefined;

      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({ executionId: "exec-abc", result: null }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      await assert.doesNotReject(() =>
        client.evaluator.run("eval-123", { input: {} }),
      );

      const body = JSON.parse(capturedBody!);
      assert.deepStrictEqual(body.input, {});
    });

    it("should pass multiple input fields", async () => {
      let capturedBody: string | undefined;

      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({ executionId: "exec-123", result: null }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      await client.evaluator.run("eval-123", {
        input: { text: "Hello", context: "A greeting", language: "en" },
      });

      const body = JSON.parse(capturedBody!);
      assert.deepStrictEqual(body.input, {
        text: "Hello",
        context: "A greeting",
        language: "en",
      });
    });
  });

  // ─── error handling ──────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("should throw when API returns non-200 status", async () => {
      global.fetch = (async () =>
        new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
        })) as typeof global.fetch;

      await assert.rejects(() => client.evaluator.get("non-existent"));
    });

    it("should throw when create returns non-200 status", async () => {
      global.fetch = (async () =>
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        })) as typeof global.fetch;

      await assert.rejects(() =>
        client.evaluator.create({
          name: "Test",
          messages: [{ role: "user", content: "test" }],
          provider: "openai",
          model: "gpt-4o",
          inputSchema: [{ name: "text", type: "string" }],
          outputSchema: [{ name: "result", type: "boolean" }],
        }),
      );
    });

    it("should throw when update returns non-200 status", async () => {
      global.fetch = (async () =>
        new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
        })) as typeof global.fetch;

      await assert.rejects(() =>
        client.evaluator.update("eval-123", { name: "New Name" }),
      );
    });

    it("should throw when run returns non-200 status", async () => {
      global.fetch = (async () =>
        new Response(JSON.stringify({ error: "Server Error" }), {
          status: 500,
        })) as typeof global.fetch;

      await assert.rejects(() =>
        client.evaluator.run("eval-123", { input: { text: "test" } }),
      );
    });

    it("should include the API error message in the thrown error", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({ error: "Evaluator not found: my-eval" }),
          { status: 404 },
        )) as typeof global.fetch;

      await assert.rejects(
        () => client.evaluator.get("my-eval"),
        /Evaluator not found: my-eval/,
      );
    });

    it("should propagate network failures", async () => {
      global.fetch = (async () => {
        throw new Error("Network request failed");
      }) as typeof global.fetch;

      await assert.rejects(
        () => client.evaluator.run("eval-123", { input: { text: "test" } }),
        /Network request failed/,
      );
    });
  });
});
