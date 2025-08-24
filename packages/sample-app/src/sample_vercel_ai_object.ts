import * as traceloop from "@traceloop/node-server-sdk";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

import "dotenv/config";

traceloop.initialize({
  appName: "sample_vercel_ai_object",
  disableBatch: true,
});

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  occupation: z.string(),
  skills: z.array(z.string()),
  location: z.object({
    city: z.string(),
    country: z.string(),
  }),
});

async function generatePersonProfile(description: string) {
  return await traceloop.withWorkflow(
    { name: "generate_person_profile" },
    async () => {
      const { object } = await generateObject({
        model: openai("gpt-4o"),
        schema: PersonSchema,
        prompt: `Based on this description, generate a detailed person profile: ${description}`,
        experimental_telemetry: { isEnabled: true },
      });

      return object;
    },
    { description },
  );
}

async function main() {
  const profile = await generatePersonProfile(
    "A talented software engineer from Paris who loves working with AI and machine learning, speaks multiple languages, and enjoys traveling.",
  );

  console.log("Generated person profile:", JSON.stringify(profile, null, 2));
}

main().catch(console.error);
