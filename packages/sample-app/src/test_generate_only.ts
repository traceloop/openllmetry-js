/**
 * Simple test for image generation only
 */

import * as dotenv from "dotenv";
import { initialize } from "@traceloop/node-server-sdk";
import * as fs from "fs";

// Load environment variables from .env file
dotenv.config();

// Initialize Traceloop SDK with image support FIRST
console.log("🚀 Initializing Traceloop SDK for generate test...");
initialize({
  appName: "openai-generate-test",
  apiKey: process.env.TRACELOOP_API_KEY,
  baseUrl: process.env.TRACELOOP_BASE_URL,
  traceContent: true,
  logLevel: "debug", // Enable debug logging
});

// Import OpenAI AFTER instrumentation is set up
import OpenAI from "openai";

// Create OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testGenerateOnly(): Promise<void> {
  console.log("\n🎨 Testing ONLY image generation...");

  const prompt =
    "A children's book drawing of a veterinarian using a stethoscope to listen to the heartbeat of a baby otter.";

  console.log("📝 Prompt:", prompt);
  console.log("🎨 Generating image with gpt-image-1...");

  try {
    // This call will be instrumented by Traceloop
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
    });

    console.log("✅ Image generated successfully!");

    // Save the image
    if (response.data && response.data.length > 0) {
      const firstImage = response.data[0];
      if (firstImage.url) {
        const imageResponse = await fetch(firstImage.url);
        const imageBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);

        fs.writeFileSync("otter_test.png", buffer);
        console.log("💾 Image saved as otter_test.png");
        console.log("🔗 Generated URL:", firstImage.url);
      }
    }

    console.log("\n🔍 Check your Traceloop dashboard for:");
    console.log("- Span: openai.images.generate");
    console.log("- Model: gpt-image-1");
    console.log("- Prompt and generated image");
  } catch (error: any) {
    console.error("❌ Error generating image:", error.message);
    throw error;
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    await testGenerateOnly();

    console.log("\n🎉 Generate test completed!");
  } catch (error: any) {
    console.error("💥 Test failed:", error.message);
    process.exit(1);
  }

  // Give time for spans to be exported - increase timeout significantly
  setTimeout(() => {
    console.log("\n⏱️ Allowing time for trace export...");
    process.exit(0);
  }, 10000);
}

// Run the test
main().catch(console.error);
