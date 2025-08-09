/**
 * Sample application demonstrating OpenAI image generation with Traceloop instrumentation
 * 
 * This sample shows how to:
 * 1. Initialize Traceloop SDK with image support
 * 2. Generate images using OpenAI DALL-E API
 * 3. Automatic tracing and image upload to Traceloop backend
 * 
 * Prerequisites:
 * - Set OPENAI_API_KEY environment variable
 * - Set TRACELOOP_API_KEY environment variable (optional, for full functionality)
 * 
 * Usage:
 * OPENAI_API_KEY=your_key TRACELOOP_API_KEY=your_key node openai_image_generation_sample.mjs
 */

import { initialize } from "@traceloop/node-server-sdk";
import OpenAI from "openai";
import fs from "fs";

// Initialize Traceloop SDK with image support
console.log("🚀 Initializing Traceloop SDK with image generation support...");
initialize({
  appName: "image-generation-sample",
  apiKey: process.env.TRACELOOP_API_KEY,
  baseUrl: process.env.TRACELOOP_BASE_URL,
  traceContent: true,
});

// Create OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log("✅ SDK initialized. Starting image generation...\n");

async function generateVeterinarianImage() {
  const prompt = `
A children's book drawing of a veterinarian using a stethoscope to 
listen to the heartbeat of a baby otter.
`;

  console.log("📝 Prompt:", prompt.trim());
  console.log("\n🎨 Generating image with DALL-E...");

  try {
    // This call will be automatically instrumented by Traceloop
    const result = await openai.images.generate({
      model: "dall-e-3", // Note: Changed from "gpt-image-1" to correct model name
      prompt: prompt.trim(),
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json", // Get base64 response
    });

    console.log("✅ Image generated successfully!");

    // Save the image to a file
    const image_base64 = result.data[0].b64_json;
    if (image_base64) {
      const image_bytes = Buffer.from(image_base64, "base64");
      fs.writeFileSync("otter.png", image_bytes);
      console.log("💾 Image saved as otter.png");
    } else {
      console.log("⚠️ No base64 data received. Image URL:", result.data[0].url);
    }

    // Display metadata
    console.log("\n📊 Generation metadata:");
    console.log("- Model:", result.data[0].revised_prompt ? "DALL-E 3 (with revised prompt)" : "DALL-E 3");
    if (result.data[0].revised_prompt) {
      console.log("- Revised prompt:", result.data[0].revised_prompt);
    }
    
    console.log("\n🔍 Check your Traceloop dashboard for:");
    console.log("- Span: openai.images.generate");
    console.log("- Request attributes: model, prompt, size, quality");
    console.log("- Response content: generated image (if image upload is configured)");

    return result;

  } catch (error) {
    console.error("❌ Error generating image:", error.message);
    
    if (error.status === 401) {
      console.error("🔑 Please set a valid OPENAI_API_KEY environment variable");
    } else if (error.status === 429) {
      console.error("⏰ Rate limit reached. Please try again later.");
    }
    
    throw error;
  }
}

async function generateImageVariation() {
  console.log("\n🔄 Testing image variation generation...");
  
  try {
    // First, check if we have a base image to work with
    if (!fs.existsSync("otter.png")) {
      console.log("⚠️ No base image found. Skipping variation test.");
      return;
    }

    // Read the generated image
    const imageBuffer = fs.readFileSync("otter.png");
    
    console.log("🖼️ Creating variation of otter.png...");

    // This call will also be instrumented by Traceloop
    const result = await openai.images.createVariation({
      image: imageBuffer,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    });

    console.log("✅ Image variation generated!");

    // Save the variation
    const variation_base64 = result.data[0].b64_json;
    if (variation_base64) {
      const variation_bytes = Buffer.from(variation_base64, "base64");
      fs.writeFileSync("otter_variation.png", variation_bytes);
      console.log("💾 Variation saved as otter_variation.png");
    }

    console.log("\n🔍 Check your Traceloop dashboard for:");
    console.log("- Span: openai.images.createVariation");
    console.log("- Input image processing and upload");
    console.log("- Generated variation image");

  } catch (error) {
    console.error("❌ Error creating variation:", error.message);
    if (error.status === 401) {
      console.error("🔑 Please set a valid OPENAI_API_KEY environment variable");
    }
  }
}

// Main execution
async function main() {
  try {
    await generateVeterinarianImage();
    await generateImageVariation();
    
    console.log("\n🎉 Image generation sample completed!");
    console.log("📊 Visit your Traceloop dashboard to see the traced operations");
    console.log("🖼️ Check the generated images: otter.png and otter_variation.png");
    
  } catch (error) {
    console.error("💥 Sample failed:", error.message);
    process.exit(1);
  }
  
  // Give time for spans to be exported
  setTimeout(() => {
    console.log("\n⏱️ Allowing time for trace export...");
    process.exit(0);
  }, 3000);
}

// Handle errors gracefully
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the sample
main().catch(console.error);