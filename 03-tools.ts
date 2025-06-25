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
  const geminiClient = config.getGeminiClient();
  const toolRegistry = await config.getToolRegistry();
  const chat = geminiClient.getChat();

  console.log("🔨 Available Tools:");
  console.log(`- ${WriteFileTool.Name}: Create/update files`);
  console.log(`- ${ReadFileTool.Name}: Read file contents`);
  console.log(`- ${LSTool.Name}: List directory contents\n`);

  // 4. Demo 1: Tool Detection (No Tools Needed)
  console.log("📋 Part 1: Tool Detection - Simple Question");
  console.log(
    "Let's see how Gemini handles questions that don't need tools...\n"
  );

  const detectPrompt = "What's the capital of France?";
  console.log(`👤 User: ${detectPrompt}`);

  const detectResponse = await chat.sendMessageStream({
    message: detectPrompt,
    config: {
      tools: [{ functionDeclarations: toolRegistry.getFunctionDeclarations() }],
    },
  });

  let hasTools1 = false;
  const chunks1 = [];
  for await (const chunk of detectResponse) {
    chunks1.push(chunk);
    // Check for function calls in the current chunk
    if (chunk.candidates?.[0]?.content?.parts) {
      for (const part of chunk.candidates[0].content.parts) {
        if (part.functionCall) {
          hasTools1 = true;
        }
        if (part.text && !part.thought) {
          process.stdout.write(part.text);
        }
      }
    }
  }

  console.log(
    `\n\n✅ Tool calls detected: ${hasTools1 ? "Yes" : "No"} (Expected: No)\n`
  );

  // Wait a moment to avoid rate limits
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 5. Demo 2: Tool Execution
  console.log("📝 Part 2: Tool Execution - File Creation");
  console.log("Now let's create a real file using tools...\n");

  const execPrompt =
    'Create a file called gemini_demo.txt with the content "Hello from Gemini tools! This file was created automatically."';
  console.log(`👤 User: ${execPrompt}\n`);

  const execResponse = await chat.sendMessageStream({
    message: execPrompt,
    config: {
      tools: [{ functionDeclarations: toolRegistry.getFunctionDeclarations() }],
    },
  });

  // Collect all function calls from the streaming response
  const allFunctionCalls: FunctionCall[] = [];
  let modelText = "";

  for await (const chunk of execResponse) {
    // Extract function calls from this chunk
    if (chunk.candidates?.[0]?.content?.parts) {
      for (const part of chunk.candidates[0].content.parts) {
        if (part.functionCall) {
          allFunctionCalls.push(part.functionCall);
        }
        if (part.text && !part.thought) {
          modelText += part.text;
          process.stdout.write(part.text);
        }
      }
    }
  }

  // Execute any function calls
  if (allFunctionCalls.length > 0) {
    console.log("\n\n🔧 Executing tool calls...\n");

    for (const fc of allFunctionCalls) {
      console.log(`📌 Tool: ${fc.name}`);
      console.log(`📋 Args: ${JSON.stringify(fc.args, null, 2)}`);

      // Create request info for the tool execution
      const requestInfo: ToolCallRequestInfo = {
        callId: fc.id || `${fc.name}-${Date.now()}`,
        name: fc.name || '',
        args: fc.args || {},
        isClientInitiated: false,
      };

      try {
        const result = await executeToolCall(
          config,
          requestInfo,
          toolRegistry,
          new AbortController().signal
        );

        if (result.error) {
          console.error(`❌ Error: ${result.error.message}\n`);
        } else {
          console.log(`✅ Success!`);
          if (result.resultDisplay) {
            console.log(`📊 Result: ${result.resultDisplay}\n`);
          }
        }
      } catch (error) {
        console.error(`❌ Failed to execute tool: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  } else {
    console.log("\n❓ No function calls detected in the response");
  }

  // Wait before next operation
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 6. Verify with another tool
  console.log("\n📂 Part 3: Verification - List Files");
  console.log("Let's verify the file was created by listing .txt files...\n");

  const verifyPrompt = "List all .txt files in the current directory";
  console.log(`👤 User: ${verifyPrompt}\n`);

  const verifyResponse = await chat.sendMessageStream({
    message: verifyPrompt,
    config: {
      tools: [{ functionDeclarations: toolRegistry.getFunctionDeclarations() }],
    },
  });

  const verifyFunctionCalls: FunctionCall[] = [];
  let verifyText = "";

  for await (const chunk of verifyResponse) {
    if (chunk.candidates?.[0]?.content?.parts) {
      for (const part of chunk.candidates[0].content.parts) {
        if (part.functionCall) {
          verifyFunctionCalls.push(part.functionCall);
        }
        if (part.text && !part.thought) {
          verifyText += part.text;
          process.stdout.write(part.text);
        }
      }
    }
  }

  if (verifyFunctionCalls.length > 0) {
    console.log("\n\n🔧 Executing verification tool calls...\n");

    for (const fc of verifyFunctionCalls) {
      const requestInfo: ToolCallRequestInfo = {
        callId: fc.id || `${fc.name}-${Date.now()}`,
        name: fc.name || '',
        args: fc.args || {},
        isClientInitiated: false,
      };

      try {
        const result = await executeToolCall(
          config,
          requestInfo,
          toolRegistry,
          new AbortController().signal
        );

        if (!result.error && result.resultDisplay) {
          console.log("📁 Directory contents:");
          console.log(result.resultDisplay);
        }
      } catch (error) {
        console.error(`❌ Failed to execute verification: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // 7. Clean up
  console.log("\n\n🧹 Cleaning up...");
  const fs = await import("fs/promises");
  try {
    await fs.unlink("gemini_demo.txt");
    console.log("✅ File deleted\n");
  } catch {
    console.log("ℹ️  File already cleaned up\n");
  }

  console.log("🎉 Tools demo complete!\n");
}

// Run the example
main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
