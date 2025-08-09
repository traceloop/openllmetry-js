/**
 * Simple image generation sample - matches the user's requested code
 * with Traceloop instrumentation automatically added
 * 
 * Setup:
 * 1. Create a .env file in the sample-app directory with:
 *    OPENAI_API_KEY=your_openai_key_here
 *    TRACELOOP_API_KEY=your_traceloop_key_here
 * 2. Run: node sample_app/simple_image_generation.mjs
 */

import dotenv from "dotenv";
import { initialize } from "@traceloop/node-server-sdk";
import OpenAI from "openai";
import fs from "fs";

// Load environment variables
dotenv.config();

// Initialize Traceloop - this enables automatic instrumentation
initialize({
  appName: "simple-image-generation",
  apiKey: process.env.TRACELOOP_API_KEY,
});

const openai = new OpenAI();

const prompt = `
A children's book drawing of a veterinarian using a stethoscope to 
listen to the heartbeat of a baby otter.
`;

const result = await openai.images.generate({
    model: "dall-e-3", // Using the correct model name for DALL-E 3
    prompt,
    response_format: "b64_json", // Need to specify this to get b64_json
});

// Save the image to a file
const image_base64 = result.data[0].b64_json;
const image_bytes = Buffer.from(image_base64, "base64");
fs.writeFileSync("otter.png", image_bytes);

console.log("Image saved as otter.png");
console.log("Check your Traceloop dashboard for the traced image generation!");