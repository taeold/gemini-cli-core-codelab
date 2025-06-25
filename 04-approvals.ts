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
    model: 'gemini-2.5-flash-lite-preview-06-17',
    coreTools: [
      'read_file',
      'write_file', 
      'run_shell_command',
      'grep'
    ],
  });

  // 3. Initialize
  await config.refreshAuth(AuthType.USE_GEMINI);
  const geminiClient = config.getGeminiClient();
  const toolRegistry = await config.getToolRegistry();
  const chat = geminiClient.getChat();

  console.log('🔨 Available Tools:');
  console.log(`- ${WriteFileTool.Name}: Create/update files (requires approval)`)
  console.log(`- ${ShellTool.Name}: Execute shell commands (requires approval)`);
  console.log(`- ${ReadFileTool.Name}: Read file contents (no approval needed)`);
  console.log(`- ${GrepTool.Name}: Search patterns (no approval needed)\n`);

  // 4. Create CoreToolScheduler with approval handling
  const abortController = new AbortController();
  let scheduler: CoreToolScheduler | null = null;
  
  const createScheduler = (registry: ToolRegistry) => {
    return new CoreToolScheduler({
      config,
      toolRegistry: Promise.resolve(registry),
      getPreferredEditor: () => undefined,
      onAllToolCallsComplete: async (completedCalls: CompletedToolCall[]) => {
        console.log('\n✅ All tool calls completed!');
        for (const call of completedCalls) {
          console.log(`  - ${call.request.name}: ${call.status}`);
        }
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

  // 5. Demo 1: Safe operation (no approval needed)
  console.log('📝 Demo 1: Safe Operation (No Approval)');
  console.log('👤 User: Search for TypeScript files in this directory\n');

  const response1 = await chat.sendMessageStream({
    message: 'Use grep to find all TypeScript files (*.ts) in the current directory',
    config: {
      tools: [{ functionDeclarations: toolRegistry.getFunctionDeclarations() }],
    },
  });

  const functionCalls1: Array<{id?: string, name?: string, args?: Record<string, unknown>}> = [];
  for await (const resp of response1) {
    if (resp.functionCalls) {
      functionCalls1.push(...resp.functionCalls);
    }
    if (resp.candidates?.[0]?.content?.parts) {
      for (const part of resp.candidates[0].content.parts) {
        if (part.text && !part.thought) {
          process.stdout.write(part.text);
        }
      }
    }
  }

  if (functionCalls1.length > 0) {
    console.log('\n\n🔧 Executing tools (no approval needed for grep)...');
    scheduler = createScheduler(toolRegistry);
    
    const toolRequests: ToolCallRequestInfo[] = functionCalls1.map(fc => ({
      callId: fc.id ?? `${fc.name}-${Date.now()}`,
      name: fc.name as string,
      args: (fc.args ?? {}) as Record<string, unknown>,
    }));
    
    await scheduler.schedule(toolRequests, abortController.signal);
  }

  console.log('\n');

  // 6. Demo 2: Destructive operation (needs approval)
  console.log('📝 Demo 2: Destructive Operation (Needs Approval)');
  console.log('👤 User: Create a test file with some Gemini-related content\n');

  const response2 = await chat.sendMessageStream({
    message: 'Create a file called gemini_test.md with content explaining what Google Gemini is',
    config: {
      tools: [{ functionDeclarations: toolRegistry.getFunctionDeclarations() }],
    },
  });

  const functionCalls2: Array<{id?: string, name?: string, args?: Record<string, unknown>}> = [];
  for await (const resp of response2) {
    if (resp.functionCalls) {
      functionCalls2.push(...resp.functionCalls);
    }
    if (resp.candidates?.[0]?.content?.parts) {
      for (const part of resp.candidates[0].content.parts) {
        if (part.text && !part.thought) {
          process.stdout.write(part.text);
        }
      }
    }
  }

  if (functionCalls2.length > 0) {
    console.log('\n\n🔧 Executing tools (approval required for write_file)...');
    scheduler = createScheduler(toolRegistry);
    
    const toolRequests: ToolCallRequestInfo[] = functionCalls2.map(fc => ({
      callId: fc.id ?? `${fc.name}-${Date.now()}`,
      name: fc.name as string,
      args: (fc.args ?? {}) as Record<string, unknown>,
    }));
    
    await scheduler.schedule(toolRequests, abortController.signal);
  }

  console.log('\n');

  // 7. Demo 3: Shell command (needs approval)
  console.log('📝 Demo 3: Shell Command (Needs Approval)');
  console.log('👤 User: Show the current directory listing\n');

  const response3 = await chat.sendMessageStream({
    message: 'Run the ls -la command to show detailed directory listing',
    config: {
      tools: [{ functionDeclarations: toolRegistry.getFunctionDeclarations() }],
    },
  });

  const functionCalls3: Array<{id?: string, name?: string, args?: Record<string, unknown>}> = [];
  for await (const resp of response3) {
    if (resp.functionCalls) {
      functionCalls3.push(...resp.functionCalls);
    }
    if (resp.candidates?.[0]?.content?.parts) {
      for (const part of resp.candidates[0].content.parts) {
        if (part.text && !part.thought) {
          process.stdout.write(part.text);
        }
      }
    }
  }

  if (functionCalls3.length > 0) {
    console.log('\n\n🔧 Executing tools (approval required for shell commands)...');
    scheduler = createScheduler(toolRegistry);
    
    const toolRequests: ToolCallRequestInfo[] = functionCalls3.map(fc => ({
      callId: fc.id ?? `${fc.name}-${Date.now()}`,
      name: fc.name as string,
      args: (fc.args ?? {}) as Record<string, unknown>,
    }));
    
    await scheduler.schedule(toolRequests, abortController.signal);
  }

  // 8. Clean up
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