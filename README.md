# opencode-mem0

**Persistent, long-term memory for OpenCode agents, powered by Mem0.**

The `opencode-mem0` plugin integrates [Mem0](https://mem0.ai) to provide your AI agent with a persistent knowledge base. It enables the agent to remember user preferences, project-specific details, and past context across different sessions, making interactions more personalized and intelligent.

## Key Features

*   **🧠 Passive RAG Injection**: Automatically searches for relevant memories based on the initial session context and injects them into the chat (tagged as `<RelevantMemories>`).
*   **📝 Auto-Capture**: Silently builds a knowledge base by capturing and storing user messages (under 2000 characters) without interrupting the workflow.
*   **🔒 Privacy & Security**: Includes a built-in scrubber that automatically redacts sensitive information (API keys, JWTs, private keys) before data leaves your local machine.
*   **⚡ Dual Scoping**:
    *   **User Scope**: Cross-project memories linked to your `MEM0_USER_ID` (e.g., "Always use TypeScript").
    *   **Project Scope**: Repository-specific memories derived from the current git worktree (e.g., "Deploy script is in ./scripts/deploy.sh").

## Installation

1.  **Install Dependencies**:
    Navigate to the plugin directory and install dependencies:
    ```bash
    cd plugins/opencode-mem0
    bun install
    ```

2.  **Register Plugin**:
    Add the plugin to your `opencode.json` configuration file:
    ```json
    {
      "plugins": [
        {
          "name": "opencode-mem0",
          "path": "./plugins/opencode-mem0"
        }
      ]
    }
    ```

## Configuration

The plugin requires a valid **Mem0 API Key**.

Set the following environment variables in your OpenCode environment (e.g., `.env`):

| Variable | Required | Default | Description |
|----------|:--------:|:-------:|-------------|
| `MEM0_API_KEY` | ✅ | - | Your API Key from [mem0.ai](https://mem0.ai). |
| `MEM0_USER_ID` | ❌ | `anonymous` | Unique identifier for user-scoped memories. |
| `MEM0_ENABLED` | ❌ | `true` | Master switch to enable/disable the plugin. |
| `MEM0_RAG_ENABLED` | ❌ | `true` | Enable/disable passive memory injection at session start. |
| `MEM0_AUTO_ADD` | ❌ | `true` | Enable/disable automatic message capture. |

## Usage

### Automatic Behavior (Passive)

The plugin operates seamlessly in the background:

*   **Context Injection**: At the start of a session, it retrieves relevant memories to ground the AI's responses in your specific context.
*   **Continuous Learning**: As you interact, the plugin automatically captures non-sensitive information to refine its understanding of your workflow.

### Manual Tools (Active)

You can actively manage the memory bank using the provided tools.

#### `memory`
Manage memories with `search`, `add`, `delete`, `list`, and `clear` actions.

**Search Memories**
```javascript
memory({ action: "search", query: "deployment instructions" })
```

**Add a Memory**
```javascript
// Add to project scope (default)
memory({ action: "add", query: "The build output is in /dist" })

// Add to user scope (global preference)
memory({ action: "add", query: "Prefer functional programming patterns", scope: "user" })
```

**List Recent Memories**
```javascript
memory({ action: "list" })
```

**Delete a Memory**
```javascript
memory({ action: "delete", memory_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" })
```

**Clear Memories**
```javascript
// Clear all project memories
memory({ action: "clear", scope: "project" })
```

#### `memory_status`
Check the connection status and configuration.

```javascript
memory_status({ _confirm: "yes" })
```

## Security & Privacy

This plugin is designed with a **Privacy-First** architecture. Before any data is transmitted to Mem0:

1.  **Local Redaction**: A rigorous regex-based scrubber runs locally to detect and redact:
    *   **API Keys** (OpenAI, Anthropic, Google, AWS, etc.)
    *   **Authentication Tokens** (GitHub PATs, Slack, JWTs)
    *   **Private Keys** (SSH, GPG, PEM)
    *   **Credentials** (Passwords, Secrets)
2.  **Sanitization**: Redacted items are replaced with `[REDACTED]` placeholders.

**Note**: While we strive to catch all secrets, please be mindful of the data you explicitly ask the agent to remember.
