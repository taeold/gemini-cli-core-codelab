#!/usr/bin/env tsx
/**
 * Step 1: Hello World
 *
 * This example demonstrates the basics of using the Gemini CLI core package:
 * - Setting up configuration with API key
 * - Creating a GeminiClient and chat instance
 * - Sending a simple message and getting a response
 *
 * To run: npm run step1
 */

import { Config, sessionId, AuthType } from "@google/gemini-cli-core";

async function main() {
  // 1. Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ Please set GEMINI_API_KEY environment variable");
    console.error("Get your key at: https://aistudio.google.com/app/apikey");
    process.exit(1);
  }

  console.log("🚀 Gemini CLI Core - Hello World Example\n");

  // 2. Create configuration
  const config = new Config({
    sessionId,
    targetDir: process.cwd(),
    cwd: process.cwd(),
    debugMode: false,
    model: "gemini-2.5-flash",
    coreTools: [],
  });

  // 3. Initialize authentication (this creates the GeminiClient internally)
  await config.refreshAuth(AuthType.USE_GEMINI);

  // 4. Get the GeminiClient and chat instance from config
  const geminiClient = config.getGeminiClient();
  const chat = geminiClient.getChat();

  // 5. Send a message and get response
  console.log("📝 Sending message to Gemini...\n");
  const response = await chat.sendMessage({
    message:
      "Hello! I'm learning about Gemini. Can you tell me an interesting fact about the Gemini constellation or Google's Gemini AI?",
    config: {},
  });

  // 6. Extract and display the response
  const text = response.text;

  console.log("🤖 Gemini says:\n");
  console.log(text);
  console.log(
    "\n✅ Success! You've made your first call to Gemini using the core package."
  );

  // 7. Show some metadata
  console.log("\n📊 Response metadata:");
  console.log(`- Session ID: ${config.getSessionId()}`);
  console.log(`- Model: ${config.getModel()}`);
  console.log(
    `- Token count: ${response.usageMetadata?.candidatesTokenCount || 0} tokens`
  );
}

// Run the example
main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
