# Gemini CLI Core Package Codelab

Welcome to the Gemini CLI Core Package codelab! This hands-on tutorial will teach you how to use the core package to build your own application powered by [Gemini CLI](https://github.com/google-gemini/gemini-cli)'s coding agent.

## 📋 Prerequisites

- Node.js 18+ installed
- Basic TypeScript/JavaScript knowledge
- Gemini API key (get one at https://aistudio.google.com/app/apikey)

## 🚀 Getting Started

### 1. Install Dependencies

```bash
# Clone this codelab repository
git clone <your-codelab-repo>
cd gemini-cli-core-codelab

# Install all dependencies including @google/gemini-cli-core
npm install
```

### 2. Set Your API Key

```bash
export GEMINI_API_KEY="your-api-key-here"
```

## 📚 Codelab Steps

### Step 1: Hello World (5 min)

Learn the basics of setting up the core package and sending your first message.

```bash
npm run step1
```

**Key concepts:**

- Creating a Config instance with sessionId
- Authentication with AuthType.USE_GEMINI
- Sending messages with chat.sendMessage()
- Getting response text and metadata

### Step 2: Streaming and Thinking (5 min)

Implement real-time streaming responses with thinking display.

```bash
npm run step2
```

**Key concepts:**

- Using sendMessageStream() for real-time responses
- Detecting and displaying AI thinking (part.thought === true)
- Processing streaming events
- Handling text output character by character

### Step 3: Built-in Tools - Detection and Execution (5 min)

Learn how Gemini detects when tools are needed and execute them directly.

```bash
npm run step3
```

**Key concepts:**

- Configuring coreTools: ['read_file', 'write_file', 'list_directory']
- Tool detection from streaming responses
- Direct tool execution with executeToolCall()
- Handling FunctionCall objects and tool results

### Step 4: Tool Approvals with CoreToolScheduler (5 min)

Implement approval flows for sensitive operations using CoreToolScheduler.

```bash
npm run step4
```

**Key concepts:**

- Creating and configuring CoreToolScheduler
- Handling tool approval prompts
- ToolConfirmationOutcome options (ProceedOnce, ProceedAlwaysTool, Cancel)
- Managing tool execution lifecycle

### Step 5: Advanced Integration (10 min)

Combine all features into a polished CLI experience with custom tools.

```bash
npm run step5
```

**Key concepts:**

- Building a complete REPL interface
- Creating custom tools (CalculatorTool example)
- Streaming with spinners and colored output
- Integrating CoreToolScheduler with chat flow
- Handling all tool states and user interactions

## 📚 Resources

- [Gemini CLI Launch Blog Post](https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/)
- [Gemini CLI GitHub Repository](https://github.com/google-gemini/gemini-cli)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [@google/gemini-cli-core on npm](https://www.npmjs.com/package/@google/gemini-cli-core)
