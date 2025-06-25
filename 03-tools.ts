#!/usr/bin/env tsx
/**
 * Step 3: Built-in Tools - Detection and Execution
 *
 * This example demonstrates:
 * - How Gemini detects when tools are needed
 * - Direct tool execution with executeToolCall
 * - Working with tool results
 * - Handling function calls from streaming responses
 *
 * To run: npm run step3
 */

import {
  Config,
  sessionId,
  AuthType,
  executeToolCall,
  ToolCallRequestInfo,
  ReadFileTool,
  WriteFileTool,
  LSTool,
} from "@google/gemini-cli-core";
import type { FunctionCall } from "@google/genai";

async function runChatWithTool(prompt: string, config: Config) {
  const geminiClient = config.getGeminiClient();
  const toolRegistry = await config.getToolRegistry();
  const chat = geminiClient.getChat();

  console.log(`👤 User: ${prompt}\n`);

  let messages = [{ role: "user", parts: [{ text: prompt }] }];

  while (true) {
    const functionCalls: FunctionCall[] = [];
    let thinkingText = "";
    let responseText = "";

    const responseStream = await chat.sendMessageStream({
      message: messages[0]?.parts || [],
      config: {
        tools: [
          { functionDeclarations: toolRegistry.getFunctionDeclarations() },
        ],
      },
    });

    for await (const chunk of responseStream) {
      if (chunk.candidates?.[0]?.content?.parts) {
        for (const part of chunk.candidates[0].content.parts) {
          // The `thought` property is not in the standard GenAI type,
          // but is added by the core library's wrapper.
          if ((part as any).thought === true && part.text) {
            thinkingText += part.text;
          } else if (part.text) {
            responseText += part.text;
          }
          if (part.functionCall) {
            functionCalls.push(part.functionCall);
          }
        }
      }
    }

    if (functionCalls.length > 0) {
      console.log("\n🤔 Thinking...");
      // Any text that accompanies a tool call is part of the thinking process.
      const combinedText = (thinkingText + responseText).trim();
      if (combinedText) {
        console.log("\x1b[2m" + combinedText + "\x1b[0m");
      }
      const toolResponseParts: any[] = [];

      for (const fc of functionCalls) {
        const callId = fc.id ?? `${fc.name}-${Date.now()}`;
        const requestInfo: ToolCallRequestInfo = {
          callId,
          name: fc.name as string,
          args: (fc.args ?? {}) as Record<string, unknown>,
          isClientInitiated: false,
        };

        const toolResponse = await executeToolCall(
          config,
          requestInfo,
          toolRegistry,
          new AbortController().signal
        );

        if (toolResponse.responseParts) {
          const output = (toolResponse.responseParts as any).functionResponse
            .response.output;
          console.log(`\n🛠️ Tool Output (${fc.name}):\n`, output);
          const parts = Array.isArray(toolResponse.responseParts)
            ? toolResponse.responseParts
            : [toolResponse.responseParts];
          for (const part of parts) {
            if (typeof part === "string") {
              toolResponseParts.push({ text: part });
            } else if (part) {
              toolResponseParts.push(part);
            }
          }
        }
      }
      messages = [{ role: "user", parts: toolResponseParts }];
    } else {
      // This is a final response without a tool call.
      // It might have thinking steps followed by the answer.
      if (thinkingText) {
        console.log("\n🤔 Thinking...");
        console.log("\x1b[2m" + thinkingText.trim() + "\x1b[0m");
      }
      console.log("\n🤖 Assistant:");
      console.log(responseText.trim());
      break;
    }
  }
}

async function main() {
  // 1. Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ Please set GEMINI_API_KEY environment variable");
    console.error("Get your key at: https://aistudio.google.com/app/apikey");
    process.exit(1);
  }

  console.log("🚀 Gemini CLI Core - Tools Demo\n");

  // 2. Create configuration with tools
  const config = new Config({
    sessionId,
    targetDir: process.cwd(),
    cwd: process.cwd(),
    debugMode: false,
    model: "gemini-2.5-flash",
    coreTools: [ReadFileTool.Name, WriteFileTool.Name, LSTool.Name],
  });

  // 3. Initialize
  await config.refreshAuth(AuthType.USE_GEMINI);

  console.log("🔨 Available Tools:");
  console.log(`- ${WriteFileTool.Name}: Create/update files`);
  console.log(`- ${ReadFileTool.Name}: Read file contents`);
  console.log(`- ${LSTool.Name}: List directory contents\n`);

  // 4. Demo 1: Tool Detection (No Tools Needed)
  console.log("📋 Part 1: Tool Detection - Simple Question");
  console.log(
    "Let's see how Gemini handles questions that don't need tools...\n"
  );
  await runChatWithTool("What's the capital of France?", config);

  // 5. Demo 2: Tool Execution
  console.log("\n📝 Part 2: Tool Execution - File Creation");
  console.log("Now let's create a real file using tools...\n");
  await runChatWithTool(
    'Create a file called gemini_demo.txt with the content "Hello from Gemini tools! This file was created automatically."',
    config
  );

  // 6. Demo 3: Tool Execution w/ response
  console.log("\n📂 Part 3: Feeding tool response");
  console.log("Let's verify the file was created by listing .txt files...\n");
  await runChatWithTool("List all .txt files in the current directory", config);

  // 7. Clean up
  console.log("\n\n🧹 Cleaning up...");
  const fs = await import("fs/promises");
  try {
    await fs.unlink("gemini_demo.txt");
    console.log("✅ File deleted\n");
  } catch {
    console.log("ℹ️  File already cleaned up\n");
  }
}

// Run the example
main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
