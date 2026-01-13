# Mem0 Memory Plugin

**Purpose:** Persistent long-term memory integration via Mem0 API with auto-capture and RAG injection.

## WHERE TO LOOK

| Component | Detail | Notes |
|-----------|--------|-------|
| **Tools** | `memory` | Actions: search, add, delete, list, clear |
| **Status** | `memory_status` | Check API connection & config |
| **Auth** | `MEM0_API_KEY` | **REQUIRED** in environment |
| **Scoping** | `MEM0_USER_ID` | Defaults to 'anonymous' (User Scope) |
| **Config** | `MEM0_ENABLED` | Master toggle (also _RAG_ENABLED, _AUTO_ADD) |

## CONVENTIONS

**Behavior:**
- **Passive RAG:** Injects `<RelevantMemories>` block at session start automatically.
- **Auto-Capture:** Silently stores user messages <2000 chars (no tool usage required).
- **Privacy First:** Local regex scrubber redacts secrets/keys *before* API transmission.

**Scoping Rules:**
- **User Scope:** Global preferences (e.g., "Use TypeScript"). Linked to `MEM0_USER_ID`.
- **Project Scope:** Repo-specific context. Derived from git worktree. Default for active tools.

**Setup:**
- Requires `bun install` in plugin directory.

## ANTI-PATTERNS

| NEVER DO | Consequence |
|----------|-------------|
| Explicitly store secrets | Scrubber is good, but don't risk it |
| Disable `MEM0_AUTO_ADD` | Loss of conversational continuity |
| Share `MEM0_USER_ID` | Leaks personal preferences across users |
| Ignore `memory_status` | Blind to auth/connection failures |

## NOTES

- **RAG Injection** only happens on the *first* message of a session.
- Search queries hit **both** User and Project scopes (deduplicated).
- Scrubbed data is replaced with `[REDACTED]` placeholder.
