# Mem0 Long-Term Memory Plugin

**Quick Reference**: `memory` (add/search/delete/list/clear), `memory_status`

## When to Use

Use the `memory` tool when:
- User asks to remember something for future sessions
- User references past conversations or preferences
- You need to store important context about the project
- User wants to search or manage stored memories

## Tool Reference

### memory

| Action | Required Args | Description |
|--------|---------------|-------------|
| `search` | `query` | Find relevant memories matching the query |
| `add` | `query` (content) | Store new memory (secrets auto-scrubbed) |
| `delete` | `memory_id` | Remove specific memory by ID |
| `list` | - | Show recent project memories |
| `clear` | `scope` (optional) | Delete all memories for scope |

### memory_status

Check plugin configuration and status.

## Automatic Behavior

The plugin operates passively without tool calls:

1. **RAG Injection**: On first message per session, searches for relevant memories and injects them as `<RelevantMemories>` block
2. **Auto-Add**: Automatically captures user messages (<2000 chars) as project memories

Both can be disabled via environment variables.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEM0_API_KEY` | (required) | Mem0 API key |
| `MEM0_USER_ID` | `anonymous` | User identifier for cross-project memories |
| `MEM0_ENABLED` | `true` | Master enable/disable |
| `MEM0_RAG_ENABLED` | `true` | Enable passive RAG injection |
| `MEM0_AUTO_ADD` | `true` | Enable automatic memory capture |

## Scoping

- **user**: Memories shared across all projects for this user
- **project**: Memories specific to current project (default)

Search queries both scopes and deduplicates results.

## Privacy

Secrets are automatically scrubbed before storage:
- API keys, tokens, passwords
- AWS credentials, JWTs
- Private keys, Bearer tokens
- GitHub PATs, Slack tokens

## Examples

```
# Store a preference
memory(action="add", query="User prefers TypeScript over JavaScript")

# Search for context
memory(action="search", query="coding preferences")

# List recent memories
memory(action="list")

# Delete specific memory
memory(action="delete", memory_id="mem_abc123")
```
