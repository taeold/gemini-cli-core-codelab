#!/usr/bin/env tsx
/**
 * Step 2: Streaming and Thinking
 *
 * This example demonstrates:
 * - Using sendMessageStream for real-time responses
 * - Displaying the AI's thinking process
 * - Configuring thinking budget
 *
 * To run: npm run step2
 */

import { Config, sessionId, AuthType } from "@google/gemini-cli-core";

async function main() {
  // 1. Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ Please set GEMINI_API_KEY environment variable");
    console.error("Get your key at: https://aistudio.google.com/app/apikey");
    process.exit(1);
  }

  console.log("🚀 Gemini CLI Core - Streaming & Thinking Example\n");

  // 2. Create configuration
  const config = new Config({
    sessionId,
    targetDir: process.cwd(),
    cwd: process.cwd(),
    debugMode: false,
    model: "gemini-2.5-flash", // Latest model
    coreTools: [],
  });

  // 3. Initialize authentication (this creates the GeminiClient internally)
  await config.refreshAuth(AuthType.USE_GEMINI);

  // 4. Get the GeminiClient and chat instance from config
  const geminiClient = config.getGeminiClient();
  const chat = geminiClient.getChat();

  // 5. Ask a complex question that should trigger thinking
  const prompt =
    "Explain how Google Gemini's multimodal capabilities work. Think step by step about how it processes different types of inputs (text, images, audio, video) and generates unified responses.";

  console.log(`📝 User: ${prompt}\n`);

  // 6. Create stream for real-time response
  const abortController = new AbortController();
  const stream = await chat.sendMessageStream({
    message: prompt,
    config: {
      abortSignal: abortController.signal,
    },
  });

  // 7. Set up tracking variables for the streaming response
  let isThinking = false;
  let hasContent = false;
  let thoughtCount = 0;
  let contentCount = 0;

  // 8. Process the streaming events
  for await (const event of stream) {
    // Handle different parts of the response
    if (event.candidates?.[0]?.content?.parts) {
      for (const part of event.candidates[0].content.parts) {
        if (part.text) {
          // Check if this is thinking content
          if (part.thought === true) {
            if (!isThinking) {
              console.log("💭 [THINKING]");
              isThinking = true;
              hasContent = false;
            }
            // Display thinking in dim text
            process.stdout.write("\x1b[2m" + part.text + "\x1b[0m");
            thoughtCount += part.text.length;
          } else {
            // Regular content
            if (isThinking || !hasContent) {
              if (isThinking) {
                console.log("\n"); // Add spacing after thinking
              }
              console.log("🤖 [RESPONSE]");
              isThinking = false;
              hasContent = true;
            }
            process.stdout.write(part.text);
            contentCount += part.text.length;
          }
        }
      }
    }
  }

  // 9. Display summary statistics
  console.log("\n\n✅ Streaming complete!");
  console.log(`📊 Thinking: ${thoughtCount} characters`);
  console.log(`📊 Response: ${contentCount} characters`);
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
