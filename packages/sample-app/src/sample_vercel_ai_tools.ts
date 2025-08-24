import * as traceloop from "@traceloop/node-server-sdk";
import { openai } from "@ai-sdk/openai";
import { generateText, tool } from "ai";
import { z } from "zod";

import "dotenv/config";

traceloop.initialize({
  appName: "sample_vercel_ai_tools",
  disableBatch: true,
});

// Define tools
const getWeather = tool({
  description: "Get the current weather for a specified location",
  parameters: z.object({
    location: z.string().describe("The location to get the weather for"),
  }),
  execute: async ({ location }) => {
    console.log(`🔧 Tool 'getWeather' called with location: ${location}`);

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simulate weather data
    const weatherData = {
      location,
      temperature: Math.floor(Math.random() * 30) + 60, // 60-90°F
      condition: ["Sunny", "Cloudy", "Rainy", "Snowy"][
        Math.floor(Math.random() * 4)
      ],
      humidity: Math.floor(Math.random() * 40) + 40, // 40-80%
    };

    console.log(`🌤️  Weather data retrieved for ${location}:`, weatherData);
    return weatherData;
  },
});

const calculateDistance = tool({
  description: "Calculate the distance between two cities",
  parameters: z.object({
    fromCity: z.string().describe("The starting city"),
    toCity: z.string().describe("The destination city"),
  }),
  execute: async ({ fromCity, toCity }) => {
    console.log(
      `🔧 Tool 'calculateDistance' called from ${fromCity} to ${toCity}`,
    );

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Simulate distance calculation
    const distance = Math.floor(Math.random() * 2000) + 100; // 100-2100 miles
    const result = {
      from: fromCity,
      to: toCity,
      distance: `${distance} miles`,
      drivingTime: `${Math.floor(distance / 60)} hours`,
    };

    console.log(`🗺️  Distance calculated:`, result);
    return result;
  },
});

const searchRestaurants = tool({
  description: "Search for restaurants in a specific city",
  parameters: z.object({
    city: z.string().describe("The city to search for restaurants"),
    cuisine: z
      .string()
      .optional()
      .describe("Optional cuisine type (e.g., Italian, Mexican)"),
  }),
  execute: async ({ city, cuisine }) => {
    console.log(
      `🔧 Tool 'searchRestaurants' called for ${city}${cuisine ? ` (${cuisine} cuisine)` : ""}`,
    );

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Simulate restaurant data
    const restaurantNames = [
      "The Golden Fork",
      "Sunset Bistro",
      "Ocean View",
      "Mountain Top",
      "Urban Kitchen",
      "Garden Cafe",
      "Heritage House",
      "Modern Table",
    ];

    const restaurants = Array.from({ length: 3 }, (_, i) => ({
      name: restaurantNames[Math.floor(Math.random() * restaurantNames.length)],
      cuisine:
        cuisine ||
        ["Italian", "Mexican", "Asian", "American"][
          Math.floor(Math.random() * 4)
        ],
      rating: (Math.random() * 2 + 3).toFixed(1), // 3.0-5.0 rating
      priceRange: ["$", "$$", "$$$"][Math.floor(Math.random() * 3)],
    }));

    console.log(
      `🍽️  Found ${restaurants.length} restaurants in ${city}:`,
      restaurants,
    );
    return { city, restaurants };
  },
});

async function planTrip(destination: string) {
  return await traceloop.withWorkflow(
    { name: "plan_trip" },
    async () => {
      console.log(`\n🌟 Planning a trip to ${destination}...\n`);

      const result = await generateText({
        model: openai("gpt-4o"),
        prompt: `Help me plan a trip to ${destination}. I'd like to know:
1. What's the weather like there?
2. Find some good restaurants to try
3. If I'm traveling from New York, how far is it?

Please use the available tools to get current information and provide a comprehensive travel guide.`,
        tools: {
          getWeather,
          calculateDistance,
          searchRestaurants,
        },
        maxSteps: 5, // Allow multiple tool calls
        experimental_telemetry: { isEnabled: true },
      });

      return result.text;
    },
    { destination },
  );
}

async function main() {
  try {
    const travelGuide = await planTrip("San Francisco");

    console.log("\n" + "=".repeat(80));
    console.log("🗺️  TRAVEL GUIDE");
    console.log("=".repeat(80));
    console.log(travelGuide);
    console.log("=".repeat(80));
  } catch (error) {
    console.error("❌ Error planning trip:", error);
  }
}

main().catch(console.error);
