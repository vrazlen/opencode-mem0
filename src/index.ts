import { type Plugin, tool } from "@opencode-ai/plugin"
import { Mem0Service, hashString, type MemoryItem } from "./services/mem0"

const MAX_MESSAGE_LENGTH = 2000
const RAG_INJECT_LIMIT = 5

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

function formatMemoriesForInjection(memories: MemoryItem[]): string {
  if (memories.length === 0) return ""
  
  const lines = memories.map(m => `- ${m.memory}`)
  return `<RelevantMemories>\n${lines.join("\n")}\n</RelevantMemories>`
}

const injectedSessions = new Set<string>()

const Mem0Plugin: Plugin = async (ctx) => {
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
  
  return {
    "chat.message": async (input, output) => {
      const sessionId = input.sessionID
      const userMessage = output.message?.content
      
      if (!userMessage || typeof userMessage !== "string") {
        return
      }
      
      if (ragEnabled && !injectedSessions.has(sessionId)) {
        injectedSessions.add(sessionId)
        
        const queryText = userMessage.slice(0, 500)
        const memories = await service.search(queryText, RAG_INJECT_LIMIT)
        
        if (memories.length > 0) {
          const injection = formatMemoriesForInjection(memories)
          output.parts = [{ type: "text", text: injection }, ...(output.parts || [])]
        }
      }
      
      if (autoAddEnabled && userMessage.length <= MAX_MESSAGE_LENGTH) {
        const scrubbed = scrubSecrets(userMessage)
        if (scrubbed !== "[REDACTED]" && scrubbed.trim().length > 10) {
          service.add(scrubbed, "project").catch(() => {})
        }
      }
    },
    
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
            return JSON.stringify({ ok: true, count: results.length, memories: results }, null, 2)
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
            return JSON.stringify({ ok: true, count: results.length, memories: results }, null, 2)
          }
          
          if (action === "clear") {
            const result = await service.deleteAll(scope)
            return JSON.stringify({ ok: true, ...result, scope }, null, 2)
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
            version: "0.1.0",
            config: {
              enabled,
              ragEnabled,
              autoAddEnabled,
              userId,
              projectId
            },
            injectedSessions: injectedSessions.size
          }, null, 2)
        }
      })
    }
  }
}

export default Mem0Plugin
