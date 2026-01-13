# Smart Memory Plugin

**Version:** 1.0.0  
**Name:** Smart Memory (formerly Mem0 Long-Term Memory)

## Quick Reference

- `memory` - Manage long-term memory (search, add, delete, list, clear)
- `memory_status` - Check plugin status and configuration
- `memory_refresh` - Force refresh the memory cache

## When to Use

Use the `memory` tool when:
- User asks to remember something for future sessions
- User references past conversations or preferences
- You need to store important context about the project
- User wants to search or manage stored memories

## Features

### 1. Always-On Memory Injection

**Per user preference**: Memories are ALWAYS injected into the system prompt at session start, not selectively based on intent.

The plugin automatically:
1. Pre-fetches recent project memories on initialization
2. Injects them via `experimental.chat.system.transform` hook
3. Uses efficient bullet-list format with relevance scores

```xml
<memory scope="always-on" count="5">
The following memories were retrieved from long-term storage:
• User prefers TypeScript over JavaScript (95%)
• Project uses Bun as package manager (92%)
• Testing framework is Vitest (88%)
</memory>
```

### 2. Auto-Add User Messages

User messages (under 2000 chars) are automatically captured as project memories:
- Secrets are scrubbed before storage
- Short/empty messages are ignored
- Fire-and-forget (non-blocking)

### 3. Secret Scrubbing

The following patterns are automatically redacted:
- API keys, tokens, passwords
- GitHub PATs (`ghp_*`, `github_pat_*`)
- AWS credentials (`AKIA*`)
- JWTs (`eyJ*`)
- Private keys
- Bearer tokens
- Slack tokens (`xoxb-*`)

### 4. Dual-Scope Memory

| Scope | Description | Use Case |
|-------|-------------|----------|
| `user` | Shared across all projects | Personal preferences, global settings |
| `project` | Specific to current project | Project conventions, codebase patterns |

Searches query both scopes and deduplicate results.

## Tool Reference

### memory

| Action | Required Args | Description |
|--------|---------------|-------------|
| `search` | `query` | Find relevant memories matching the query |
| `add` | `query` (content) | Store new memory (secrets auto-scrubbed) |
| `delete` | `memory_id` | Remove specific memory by ID |
| `list` | - | Show recent project memories (up to 20) |
| `clear` | `scope` (optional) | Delete all memories for scope |

### memory_status

Returns plugin configuration and statistics:
- Enabled features
- User/project IDs
- Injected session count
- Cached memories count

### memory_refresh

Force refresh the memory cache for system prompt injection. Useful when:
- New memories were added and you want immediate injection
- Cache appears stale

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MEM0_API_KEY` | **Yes** | - | Mem0 API key |
| `MEM0_USER_ID` | No | `anonymous` | User identifier for cross-project memories |
| `MEM0_ENABLED` | No | `true` | Master enable/disable |
| `MEM0_RAG_ENABLED` | No | `true` | Enable always-on memory injection |
| `MEM0_AUTO_ADD` | No | `true` | Enable automatic memory capture |

## Behavior Notes

1. **Always-On**: Unlike selective/intent-based retrieval, this plugin injects memories at EVERY session start per user preference
2. **Efficient Format**: Memories are formatted as bullet lists, not verbose XML, to save tokens
3. **Session Deduplication**: Each session only gets one injection (tracked via `injectedSessions` Set)
4. **Pre-fetch**: Memories are fetched during plugin initialization for instant injection
5. **Graceful Degradation**: If Mem0 API fails, plugin continues without memories (no crash)

## Examples

```typescript
// Search for context
memory({ action: "search", query: "coding preferences" })

// Store a preference
memory({ action: "add", query: "User prefers functional components over class components" })

// Store user-level (cross-project) memory
memory({ action: "add", query: "Preferred editor is VS Code", scope: "user" })

// List recent memories
memory({ action: "list" })

// Delete specific memory
memory({ action: "delete", memory_id: "mem_abc123" })

// Clear all project memories
memory({ action: "clear", scope: "project" })

// Check status
memory_status({ _confirm: "yes" })

// Refresh cache
memory_refresh()
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No memories injected | Check `MEM0_API_KEY` is set and valid |
| Memories not persisting | Verify Mem0 API connectivity |
| Stale memories | Use `memory_refresh()` to force cache update |
| Secrets in memories | They should be auto-scrubbed; report if not |
| Plugin disabled | Check `MEM0_ENABLED` is not `false` |
