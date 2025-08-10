/**
 * Simple test for image editing only - to debug span creation
 */

import * as dotenv from "dotenv";
import { initialize } from "@traceloop/node-server-sdk";
import * as fs from "fs";

// Load environment variables from .env file
dotenv.config();

// Initialize Traceloop SDK with image support FIRST
console.log("🚀 Initializing Traceloop SDK for edit test...");
initialize({
  appName: "openai-edit-test",
  apiKey: process.env.TRACELOOP_API_KEY,
  baseUrl: process.env.TRACELOOP_BASE_URL,
  traceContent: true,
  logLevel: "debug", // Enable debug logging
});

// Import OpenAI AFTER instrumentation is set up
import OpenAI, { toFile } from "openai";

// Create OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testEditOnly(): Promise<void> {
  console.log("\n🎨 Testing ONLY image editing...");
  
  try {
    // Use the test image
    console.log("🔄 Using test_edit_image.png for editing test...");
    
    let imageFile;
    try {
      imageFile = await toFile(fs.createReadStream("test_edit_image.png"), "test_edit_image.png", {
        type: "image/png",
      });
      console.log("✅ Test image file created successfully");
    } catch (err) {
      console.error("❌ Error creating image file:", err);
      throw err;
    }

    // This call will be instrumented by Traceloop  
    console.log("🔧 Calling OpenAI images.edit with gpt-image-1...");
    const editResult = await openai.images.edit({
      image: imageFile,
      model: "gpt-image-1",
      prompt: "Add a red hat to the person",
      n: 1,
      size: "1024x1024",
    });

    console.log("✅ Image edited successfully!");
    
    if (editResult.data && editResult.data.length > 0) {
      console.log("🔗 Edit result URL:", editResult.data[0].url);
    }

    console.log("\n🔍 Check your Traceloop dashboard for:");
    console.log("- Span: openai.images.edit");
    console.log("- Model: gpt-image-1");
    console.log("- Input image and edit prompt");

  } catch (error: any) {
    console.error("❌ Error testing image editing:", error.message);
    throw error;
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    await testEditOnly();
    
    console.log("\n🎉 Edit test completed!");
    
  } catch (error: any) {
    console.error("💥 Test failed:", error.message);
    process.exit(1);
  }
  
  // Give time for spans to be exported
  setTimeout(() => {
    console.log("\n⏱️ Allowing time for trace export...");
    process.exit(0);
  }, 10000);
}

// Run the test
main().catch(console.error);