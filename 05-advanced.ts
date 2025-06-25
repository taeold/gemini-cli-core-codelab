#!/usr/bin/env tsx
/**
 * Step 5: Advanced Integration
 * 
 * This example combines all features into a polished CLI experience:
 * - Streaming responses with thinking
 * - Multiple tools (built-in and custom)
 * - Approval flows
 * - Nice formatting with spinners and colors
 * 
 * To run: npm run step5
 */

import { Config, sessionId, AuthType, LSTool, ReadFileTool, WriteFileTool, CoreToolScheduler, ToolCall, CompletedToolCall, ToolConfirmationOutcome, WaitingToolCall, GeminiEventType, BaseTool, ToolResult, ToolCallConfirmationDetails } from '@google/gemini-cli-core';
import * as readline from 'node:readline';
import { promisify } from 'node:util';
import { FunctionDeclaration } from '@google/genai';

// Simple colored output helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Mock spinner
class SimpleSpinner {
  private timer?: NodeJS.Timeout;
  private message: string;
  
  constructor(message: string) {
    this.message = message;
  }
  
  start() {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    this.timer = setInterval(() => {
      process.stdout.write(`\r${colors.cyan}${frames[i]} ${this.message}${colors.reset}`);
      i = (i + 1) % frames.length;
    }, 80);
  }
  
  stop(finalMessage?: string) {
    if (this.timer) {
      clearInterval(this.timer);
      process.stdout.write('\r' + ' '.repeat(this.message.length + 4) + '\r');
      if (finalMessage) {
        console.log(finalMessage);
      }
    }
  }
}

// Custom calculator tool for demo
class CalculatorTool extends BaseTool {
  static Name = 'calculate';

  getName(): string {
    return CalculatorTool.Name;
  }

  getDescription(): string {
    return 'Perform mathematical calculations';
  }

  getFunctionDeclaration(): FunctionDeclaration {
    return {
      name: this.getName(),
      description: 'Perform mathematical calculations',
      parameters: {
        type: 'OBJECT' as const,
        properties: {
          expression: {
            type: 'STRING' as const,
            description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "pi * r^2")',
          },
        },
        required: ['expression'],
      },
    };
  }

  validateToolParams(params: unknown): string | null {
    const args = params as { expression?: string };
    if (!args.expression) {
      return 'Expression parameter is required';
    }
    return null;
  }

  async execute(params: unknown): Promise<ToolResult> {
    const { expression } = params as { expression: string };
    
    try {
      // Simple safe math evaluation (in production, use a proper math parser)
      const result = this.evaluateExpression(expression);
      return {
        llmContent: [{
          text: `${expression} = ${result}`
        }],
        returnDisplay: `${expression} = ${result}`,
      };
    } catch (error) {
      return {
        llmContent: [{
          text: `Error calculating ${expression}: ${error instanceof Error ? error.message : String(error)}`
        }],
        returnDisplay: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private evaluateExpression(expr: string): number {
    // Very basic math evaluation - in production use mathjs or similar
    const cleaned = expr.replace(/[^0-9+\-*/().\s]/g, '');
    if (cleaned !== expr) {
      throw new Error('Invalid characters in expression');
    }
    // WARNING: eval is dangerous - only for demo purposes
    return Function('"use strict"; return (' + cleaned + ')')();
  }

  async shouldConfirmExecute(): Promise<false | ToolCallConfirmationDetails> {
    return false;
  }
}

async function confirm(message: string, rl: readline.Interface): Promise<boolean> {
  const question = promisify(rl.question).bind(rl);
  const answer = await question(`${colors.yellow}${message} (y/n) ${colors.reset}`);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error(`${colors.bright}❌ Please set GEMINI_API_KEY environment variable${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.bright}${colors.blue}🚀 Gemini CLI Core - Advanced Integration${colors.reset}`);
  console.log(`${colors.dim}Type 'help' for commands, 'exit' to quit${colors.reset}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.bright}> ${colors.reset}`,
  });

  // Create configuration with all features
  const config = new Config({
    sessionId,
    targetDir: process.cwd(),
    cwd: process.cwd(),
    debugMode: false,
    model: 'gemini-2.5-pro',
    coreTools: [LSTool.Name, ReadFileTool.Name, WriteFileTool.Name],
  });

  await config.refreshAuth(AuthType.USE_GEMINI);
  
  const geminiClient = config.getGeminiClient();
  const chat = geminiClient.getChat();
  const toolRegistry = await config.getToolRegistry();
  
  // Register custom calculator tool
  toolRegistry.registerTool(new CalculatorTool());

  // Tool scheduler
  const scheduler = new CoreToolScheduler({
    config,
    toolRegistry,
    onAllToolCallsComplete: async (completedCalls: CompletedToolCall[]) => {
      console.log(`\n${colors.green}✅ All tools completed${colors.reset}\n`);
      
      const responseParts = completedCalls.flatMap(
        (call) => call.response.responseParts,
      );
      
      const finalResponse = await chat.sendMessage({
        message: responseParts,
        config: {
          tools: [{ functionDeclarations: toolRegistry.getFunctionDeclarations() }],
        }
      });
      
      console.log(`${colors.bright}🤖 Assistant:${colors.reset}`);
      console.log(finalResponse.text);
      console.log();
      rl.prompt();
    },
    onToolCallsUpdate: async (toolCalls: ToolCall[]) => {
      for (const toolCall of toolCalls) {
        if (toolCall.status === 'awaiting_approval') {
          const waitingCall = toolCall as WaitingToolCall;
          
          console.log(`\n${colors.yellow}⚠️  Approval needed: ${waitingCall.request.name}${colors.reset}`);
          console.log(`${colors.dim}Args: ${JSON.stringify(waitingCall.request.args)}${colors.reset}`);
          
          if (waitingCall.confirmationDetails) {
            const { onConfirm } = waitingCall.confirmationDetails;
            const approved = await confirm('Proceed?', rl);
            
            if (approved) {
              onConfirm(ToolConfirmationOutcome.ProceedOnce);
            } else {
              onConfirm(ToolConfirmationOutcome.Cancel);
            }
          }
        } else if (toolCall.status === 'executing') {
          console.log(`${colors.cyan}🔄 ${toolCall.request.name}...${colors.reset}`);
        }
      }
    },
    getPreferredEditor: () => undefined,
  });

  // Handle streaming responses
  async function sendStreamingMessage(message: string) {
    const spinner = new SimpleSpinner('Thinking...');
    spinner.start();
    
    const abortController = new AbortController();
    const stream = geminiClient.sendMessageStream(
      [{ text: message }],
      abortController.signal
    );

    let hasThoughts = false;
    let hasContent = false;

    for await (const event of stream) {
      if (event.type === GeminiEventType.Thoughts && event.value.text) {
        if (!hasThoughts) {
          spinner.stop();
          console.log(`${colors.dim}${colors.magenta}💭 Thinking...${colors.reset}`);
          hasThoughts = true;
        }
        process.stdout.write(`${colors.dim}${event.value.text}${colors.reset}`);
      } else if (event.type === GeminiEventType.Content && event.value.text) {
        if (!hasContent) {
          if (!hasThoughts) spinner.stop();
          console.log(`\n${colors.bright}🤖 Assistant:${colors.reset}`);
          hasContent = true;
        }
        process.stdout.write(event.value.text);
      } else if (event.type === GeminiEventType.FunctionCalls) {
        if (!hasThoughts && !hasContent) spinner.stop();
        
        const toolCallRequests = event.value.map(fc => ({
          callId: fc.id || `${fc.name}-${Date.now()}`,
          name: fc.name,
          args: fc.args,
        }));
        
        console.log(`\n${colors.blue}🔧 Using ${toolCallRequests.length} tool(s)${colors.reset}\n`);
        scheduler.schedule(toolCallRequests, abortController.signal);
        return; // Tools will handle the rest
      }
    }
    
    console.log('\n');
    rl.prompt();
  }

  // Command handling
  rl.on('line', async (line) => {
    const input = line.trim();
    
    if (!input) {
      rl.prompt();
      return;
    }
    
    if (input.toLowerCase() === 'exit') {
      console.log(`\n${colors.bright}👋 Goodbye!${colors.reset}`);
      rl.close();
      process.exit(0);
    }
    
    if (input.toLowerCase() === 'help') {
      console.log(`\n${colors.bright}Available commands:${colors.reset}`);
      console.log('  help     - Show this help message');
      console.log('  exit     - Exit the program');
      console.log('  clear    - Clear the screen');
      console.log(`\n${colors.bright}Available tools:${colors.reset}`);
      console.log(`  📁 ls        - List files`);
      console.log(`  📄 read_file - Read file contents`);
      console.log(`  💾 write_file - Create/write files (requires approval)`);
      console.log(`  🧮 calculate - Perform calculations`);
      console.log(`\n${colors.bright}Example prompts:${colors.reset}`);
      console.log(`  "List the files in this directory"`);
      console.log(`  "Calculate the area of a circle with radius 5"`);
      console.log(`  "Create a TODO.md file with my tasks"`);
      console.log();
      rl.prompt();
      return;
    }
    
    if (input.toLowerCase() === 'clear') {
      console.clear();
      rl.prompt();
      return;
    }
    
    try {
      await sendStreamingMessage(input);
    } catch (error) {
      console.error(`\n${colors.bright}❌ Error: ${error.message}${colors.reset}\n`);
      rl.prompt();
    }
  });

  rl.prompt();
}

// Run the advanced example
main().catch(error => {
  console.error(`${colors.bright}❌ Error: ${error.message}${colors.reset}`);
  process.exit(1);
});