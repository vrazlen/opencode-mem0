import { type Plugin, tool } from "@opencode-ai/plugin"
import { Mem0Service, hashString, type MemoryItem } from "./services/mem0"

// =============================================================================
// CONFIGURATION
// =============================================================================

const MAX_MESSAGE_LENGTH = 2000
const RAG_INJECT_LIMIT = 10
const MAX_MEMORY_DISPLAY = 50

// =============================================================================
// SECRET SCRUBBING
// =============================================================================

const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey|secret|token|password|credential|auth)[\s]*[=:]\s*["']?[A-Za-z0-9_\-]{16,}["']?/gi,
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /xoxb-[A-Za-z0-9\-]{50,}/g,
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /AKIA[A-Z0-9]{16}/g,
  /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
]

function scrubSecrets(text: string): string {
  let scrubbed = text
  for (const pattern of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, "[REDACTED]")
  }
  return scrubbed
}

// =============================================================================
// MEMORY FORMATTING
// =============================================================================

function formatMemoriesForSystemPrompt(memories: MemoryItem[]): string {
  if (memories.length === 0) return ""
  
  // Efficient format: bullet list with scores for context
  const lines = memories.map(m => {
    const score = m.score ? ` (${Math.round(m.score * 100)}%)` : ""
    return `• ${m.memory}${score}`
  })
  
  return [
    `<memory scope="always-on" count="${memories.length}">`,
    `The following memories were retrieved from long-term storage:`,
    lines.join("\n"),
    `</memory>`
  ].join("\n")
}

// =============================================================================
// STATE
// =============================================================================

const injectedSessions = new Set<string>()
const sessionMemoryCache = new Map<string, MemoryItem[]>()

// =============================================================================
// PLUGIN DEFINITION
// =============================================================================

const SmartMemoryPlugin: Plugin = async (ctx) => {
  const apiKey = process.env.MEM0_API_KEY
  const userId = process.env.MEM0_USER_ID || "anonymous"
  const enabled = process.env.MEM0_ENABLED !== "false"
  const ragEnabled = process.env.MEM0_RAG_ENABLED !== "false"
  const autoAddEnabled = process.env.MEM0_AUTO_ADD !== "false"
  
  if (!apiKey) {
    console.warn("[mem0] MEM0_API_KEY not set, plugin disabled")
    return {}
  }
  
  if (!enabled) {
    return {}
  }
  
  const projectId = ctx.project?.id || hashString(ctx.worktree || ctx.directory || "default")
  const service = new Mem0Service(apiKey, userId, projectId)
  
  // Pre-fetch memories for system prompt injection (always-on per user preference)
  let cachedMemories: MemoryItem[] = []
  if (ragEnabled) {
    // Fetch recent project memories on plugin init for always-on injection
    service.getRecent(RAG_INJECT_LIMIT).then(memories => {
      cachedMemories = memories
    }).catch(() => {
      // Silent fail - memories will be empty
    })
  }
  
  return {
    // =========================================================================
    // HOOK: System Prompt Injection (Always-On Memory)
    // =========================================================================
    "experimental.chat.system.transform": async (input, output) => {
      if (!ragEnabled) return
      
      const sessionId = input.sessionID || "default"
      
      // Use cached memories or fetch if not available
      let memories = cachedMemories
      if (memories.length === 0 && !injectedSessions.has(sessionId)) {
        // Try to fetch on first system prompt if cache empty
        try {
          memories = await service.getRecent(RAG_INJECT_LIMIT)
          cachedMemories = memories
        } catch {
          // Silent fail
        }
      }
      
      injectedSessions.add(sessionId)
      sessionMemoryCache.set(sessionId, memories)
      
      if (memories.length > 0) {
        const injection = formatMemoriesForSystemPrompt(memories)
        output.system.push(injection)
      }
    },
    
    // =========================================================================
    // HOOK: Auto-Add User Messages
    // =========================================================================
    "chat.message": async (_input, output) => {
      if (!autoAddEnabled) return
      
      const userMessage = (output.message as any)?.content
      
      if (!userMessage || typeof userMessage !== "string") return
      if (userMessage.length > MAX_MESSAGE_LENGTH) return
      
      const scrubbed = scrubSecrets(userMessage)
      if (scrubbed === "[REDACTED]" || scrubbed.trim().length <= 10) return
      
      // Fire and forget - don't block the message flow
      service.add(scrubbed, "project").catch(() => {})
    },
    
    // =========================================================================
    // TOOLS
    // =========================================================================
    tool: {
      memory: tool({
        description: "Manage long-term memory. Actions: search (find relevant memories), add (store new memory), delete (remove by ID), list (show recent), clear (delete all project memories).",
        args: {
          action: tool.schema.enum(["search", "add", "delete", "list", "clear"]).describe("Action to perform"),
          query: tool.schema.string().optional().describe("Search query or memory content to add"),
          memory_id: tool.schema.string().optional().describe("Memory ID for delete action"),
          scope: tool.schema.enum(["user", "project"]).optional().describe("Scope for add/clear (default: project)")
        },
        async execute(args) {
          const action = args.action
          const scope = args.scope || "project"
          
          if (action === "search") {
            if (!args.query) {
              return JSON.stringify({ ok: false, error: "query is required for search" })
            }
            const results = await service.search(args.query, 10)
            return JSON.stringify({ 
              ok: true, 
              count: results.length, 
              memories: results.slice(0, MAX_MEMORY_DISPLAY) 
            }, null, 2)
          }
          
          if (action === "add") {
            if (!args.query) {
              return JSON.stringify({ ok: false, error: "query (content) is required for add" })
            }
            const scrubbed = scrubSecrets(args.query)
            const result = await service.add(scrubbed, scope)
            return JSON.stringify(result, null, 2)
          }
          
          if (action === "delete") {
            if (!args.memory_id) {
              return JSON.stringify({ ok: false, error: "memory_id is required for delete" })
            }
            const result = await service.delete(args.memory_id)
            return JSON.stringify(result, null, 2)
          }
          
          if (action === "list") {
            const results = await service.getRecent(20)
            return JSON.stringify({ 
              ok: true, 
              count: results.length, 
              memories: results.slice(0, MAX_MEMORY_DISPLAY) 
            }, null, 2)
          }
          
          if (action === "clear") {
            const result = await service.deleteAll(scope)
            return JSON.stringify({ ...result, scope }, null, 2)
          }
          
          return JSON.stringify({ ok: false, error: `Unknown action: ${action}` })
        }
      }),
      
      memory_status: tool({
        description: "Check Mem0 plugin status and configuration.",
        args: {
          _confirm: tool.schema.string().describe("Enter 'yes' to proceed")
        },
        async execute() {
          return JSON.stringify({
            ok: true,
            version: "1.0.0",
            config: {
              enabled,
              ragEnabled,
              autoAddEnabled,
              alwaysOn: true, // User preference: always inject memories
              userId,
              projectId
            },
            stats: {
              injectedSessions: injectedSessions.size,
              cachedMemoriesCount: cachedMemories.length
            }
          }, null, 2)
        }
      }),
      
      memory_refresh: tool({
        description: "Force refresh the memory cache for system prompt injection.",
        args: {},
        async execute() {
          try {
            cachedMemories = await service.getRecent(RAG_INJECT_LIMIT)
            return JSON.stringify({
              ok: true,
              refreshed: true,
              count: cachedMemories.length,
              memories: cachedMemories.map(m => m.memory.slice(0, 100))
            }, null, 2)
          } catch (error) {
            return JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : "Unknown error"
            })
          }
        }
      })
    }
  }
}

export default SmartMemoryPlugin
