#!/usr/bin/env tsx
/**
 * Step 4: Tool Approvals with CoreToolScheduler
 * 
 * This example demonstrates:
 * - How to use CoreToolScheduler for tool execution with approval flows
 * - Handling user confirmations for potentially destructive operations
 * - Different approval outcomes (proceed once, always, cancel)
 * - Live output streaming during tool execution
 * 
 * To run: npm run step4
 */

import { 
  Config, 
  sessionId, 
  AuthType,
  CoreToolScheduler,
  ToolCallRequestInfo,
  ToolCall,
  ToolConfirmationOutcome,
  ReadFileTool,
  WriteFileTool,
  ShellTool,
  GrepTool,
  CompletedToolCall,
  ToolRegistry,
} from '@google/gemini-cli-core';
import * as readline from 'readline';


async function main() {
  // 1. Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Please set GEMINI_API_KEY environment variable');
    console.error('Get your key at: https://aistudio.google.com/app/apikey');
    process.exit(1);
  }

  console.log('🚀 Gemini CLI Core - Tool Approvals Demo\n');

  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // 2. Create configuration with tools
  const config = new Config({
    sessionId,
    targetDir: process.cwd(),
    cwd: process.cwd(),
    debugMode: false,
    model: 'gemini-1.5-flash-latest',
    coreTools: [
      'read_file',
      'write_file', 
      'run_shell_command',
      'search_file_content'
    ],
  });

  // 3. Initialize
  await config.refreshAuth(AuthType.USE_GEMINI);
  const geminiClient = config.getGeminiClient();
  const toolRegistry = await config.getToolRegistry();
  const chat = geminiClient.getChat();

  console.log('🔨 Available Tools:');
  console.log(`- ${WriteFileTool.Name}: Create/update files (requires approval)`);
  console.log(`- ${ShellTool.Name}: Execute shell commands (requires approval)`);
  console.log(`- ${ReadFileTool.Name}: Read file contents (no approval needed)`);
  console.log(`- ${GrepTool.Name}: Search patterns (no approval needed)\n`);

  // 4. Create CoreToolScheduler with approval handling
  const abortController = new AbortController();
  
  const createScheduler = (registry: ToolRegistry, onComplete: (completedCalls: CompletedToolCall[]) => void) => {
    return new CoreToolScheduler({
      config,
      toolRegistry: Promise.resolve(registry),
      getPreferredEditor: () => undefined,
      onAllToolCallsComplete: async (completedCalls: CompletedToolCall[]) => {
        console.log('\n✅ All tool calls completed!');
        for (const call of completedCalls) {
          console.log(`  - ${call.request.name}: ${call.status}`);
          if (call.status === 'completed' && call.response?.responseParts) {
            const parts = Array.isArray(call.response.responseParts)
              ? call.response.responseParts
              : [call.response.responseParts];
            for (const part of parts) {
              if (part.functionResponse) {
                const responseData = part.functionResponse.response;
                const output = (responseData as any).content ?? (responseData as any).output ?? responseData;
                console.log(
                  `\n🛠️ Tool Output (${call.request.name}):\n`,
                  JSON.stringify(output, null, 2)
                );
              }
            }
          }
        }
        onComplete(completedCalls);
      },
      onToolCallsUpdate: async (toolCalls: ToolCall[]) => {
        // Handle approval prompts
        for (const toolCall of toolCalls) {
          if (toolCall.status === 'awaiting_approval' && toolCall.confirmationDetails) {
            console.log('\n⚠️  Tool requires approval:');
            console.log(`Tool: ${toolCall.request.name}`);
            console.log(`Parameters: ${JSON.stringify(toolCall.request.args, null, 2)}`);
            
            // Show approval details
            if ('diff' in toolCall.confirmationDetails) {
              console.log('\nFile changes:');
              console.log(toolCall.confirmationDetails.diff);
            } else if ('command' in toolCall.confirmationDetails) {
              console.log(`\nCommand to execute: ${toolCall.confirmationDetails.command}`);
            }
            
            // Get user confirmation
            console.log('\nApproval options:');
            console.log('  y - Proceed once');
            console.log('  a - Always approve this tool');
            console.log('  n - Cancel');
            
            const response = await new Promise<string>((resolve) => {
              rl.question('Your choice: ', resolve);
            });
            
            let outcome: ToolConfirmationOutcome;
            switch (response.toLowerCase()) {
              case 'y':
                outcome = ToolConfirmationOutcome.ProceedOnce;
                break;
              case 'a':
                outcome = ToolConfirmationOutcome.ProceedAlwaysTool;
                console.log('✅ Future calls to this tool will be auto-approved');
                break;
              default:
                outcome = ToolConfirmationOutcome.Cancel;
                console.log('❌ Tool execution cancelled');
            }
            
            toolCall.confirmationDetails.onConfirm(outcome);
          }
        }
      },
    });
  };

  const runDemo = async (title: string, prompt: string) => {
    console.log(`\n📝 ${title}`);
    console.log(`👤 User: ${prompt}\n`);

    let messages: any[] = [{ role: 'user', parts: [{ text: prompt }] }];

    while (true) {
      const response = await chat.sendMessageStream({
        message: messages[0]?.parts || [],
        config: {
          tools: [{ functionDeclarations: toolRegistry.getFunctionDeclarations() }],
        },
      });

      const functionCalls: Array<{id?: string, name?: string, args?: Record<string, unknown>}> = [];
      let streamedText = '';

      for await (const resp of response) {
        if (resp.functionCalls) {
          functionCalls.push(...resp.functionCalls);
        }
        if (resp.candidates?.[0]?.content?.parts) {
          for (const part of resp.candidates[0].content.parts) {
            if (part.text && !part.thought) {
              streamedText += part.text;
            }
          }
        }
      }

      if (functionCalls.length > 0) {
        if (streamedText) {
          process.stdout.write("\x1b[2m" + streamedText + "\x1b[0m");
        }
        console.log('\n\n🔧 Executing tools...');
        
        const schedulerFinished = new Promise<CompletedToolCall[]>(resolve => {
          const scheduler = createScheduler(toolRegistry, resolve);
          const toolRequests: ToolCallRequestInfo[] = functionCalls.map(fc => ({
            callId: fc.id ?? `${fc.name}-${Date.now()}`,
            name: fc.name as string,
            args: (fc.args ?? {}) as Record<string, unknown>,
            isClientInitiated: false,
          }));
          scheduler.schedule(toolRequests, abortController.signal);
        });
        
        const completedCalls = await schedulerFinished;
        const toolResponseParts: any[] = [];
        for (const call of completedCalls) {
          if (call.response?.responseParts) {
            const parts = Array.isArray(call.response.responseParts)
              ? call.response.responseParts
              : [call.response.responseParts];
            toolResponseParts.push(...parts);
          }
        }
        messages = [{ role: "user", parts: toolResponseParts }];

      } else {
        console.log(`\n🤖 Assistant:\n${streamedText}`);
        break;
      }
    }
  }

  // 5. Run Demos in sequence
  await runDemo(
    'Demo 1: Safe Operation (No Approval)',
    'Use the search_file_content tool to find all TypeScript files in the current directory.'
  );
  
  await runDemo(
    'Demo 2: Destructive Operation (Needs Approval)',
    'Create a file called gemini_test.md with content explaining what Google Gemini is'
  );
  
  await runDemo(
    'Demo 3: Shell Command (Needs Approval)',
    'Run the ls -la command to show detailed directory listing'
  );

  // 6. Clean up
  console.log('\n\n🧹 Cleaning up...');
  const fs = await import('fs/promises');
  try {
    await fs.unlink('gemini_test.md');
    console.log('✅ Test file deleted');
  } catch {
    console.log('ℹ️  No cleanup needed');
  }
  rl.close();
}

// Run the example
main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});