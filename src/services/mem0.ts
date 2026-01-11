import { webcrypto } from "crypto"

// Polyfill window.crypto for mem0ai SDK (it incorrectly assumes browser environment)
if (typeof globalThis.window === "undefined") {
  ;(globalThis as any).window = { crypto: webcrypto }
}

import MemoryClient from "mem0ai"

const REQUEST_TIMEOUT_MS = 10000

export interface MemoryItem {
  id: string
  memory: string
  score?: number
  createdAt?: string
  updatedAt?: string
  metadata?: Record<string, unknown>
}

export interface SearchResult {
  results: MemoryItem[]
  relations?: unknown[]
}

export type MemoryScope = "user" | "project"

export class Mem0Service {
  private client: MemoryClient | null = null
  private apiKey: string
  private userId: string
  private projectId: string

  constructor(apiKey: string, userId: string, projectId: string) {
    this.apiKey = apiKey
    this.userId = userId
    this.projectId = projectId
  }

  private getClient(): MemoryClient {
    if (!this.client) {
      this.client = new MemoryClient({ apiKey: this.apiKey })
    }
    return this.client
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    fallback: T,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const result = await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error("TIMEOUT"))
          })
        })
      ])
      clearTimeout(timeoutId)
      return result
    } catch (error) {
      clearTimeout(timeoutId)
      console.error("[mem0] Operation failed:", error instanceof Error ? error.message : error)
      return fallback
    }
  }

  private normalizeResults(response: unknown): MemoryItem[] {
    if (Array.isArray(response)) {
      return response as MemoryItem[]
    }
    if (response && typeof response === "object" && "results" in response && Array.isArray((response as any).results)) {
      return (response as any).results as MemoryItem[]
    }
    return []
  }

  async add(content: string, scope: MemoryScope = "project"): Promise<{ ok: boolean; id?: string; error?: string }> {
    const params = this.getScopeParams(scope)
    
    try {
      const result = await this.withTimeout(
        this.getClient().add(content, params),
        null,
        REQUEST_TIMEOUT_MS
      )
      
      if (!result) {
        return { ok: false, error: "Timeout or API error" }
      }
      
      const id = (result as any).results?.[0]?.id || (result as any).id || (Array.isArray(result) ? result[0]?.event_id : undefined)
      return { ok: true, id }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  }

  async search(query: string, limit: number = 5): Promise<MemoryItem[]> {
    const userParams = this.getScopeParams("user")
    const projectParams = this.getScopeParams("project")
    const client = this.getClient()
    
    const [userResponse, projectResponse] = await Promise.all([
      this.withTimeout(
        client.search(query, { ...userParams, limit }),
        [],
        REQUEST_TIMEOUT_MS
      ),
      this.withTimeout(
        client.search(query, { ...projectParams, limit }),
        [],
        REQUEST_TIMEOUT_MS
      )
    ])

    const userResults = this.normalizeResults(userResponse)
    const projectResults = this.normalizeResults(projectResponse)

    const seen = new Set<string>()
    const combined: MemoryItem[] = []
    
    for (const item of [...userResults, ...projectResults]) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        combined.push({
          id: item.id,
          memory: item.memory,
          score: item.score,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          metadata: item.metadata
        })
      }
    }
    
    return combined.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit)
  }

  async getRecent(limit: number = 10): Promise<MemoryItem[]> {
    const params = this.getScopeParams("project")
    
    const response = await this.withTimeout(
      this.getClient().getAll({ ...params, limit }),
      [],
      REQUEST_TIMEOUT_MS
    )
    
    const results = this.normalizeResults(response)
    
    return results
      .map(item => ({
        id: item.id,
        memory: item.memory,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        metadata: item.metadata
      }))
      .sort((a, b) => {
        const dateA = a.updatedAt || a.createdAt || ""
        const dateB = b.updatedAt || b.createdAt || ""
        return dateB.localeCompare(dateA)
      })
      .slice(0, limit)
  }

  async delete(memoryId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await this.withTimeout(
        this.getClient().delete(memoryId),
        null,
        REQUEST_TIMEOUT_MS
      )
      
      if (!result) {
        return { ok: false, error: "Timeout or API error" }
      }
      
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  }

  async deleteAll(scope: MemoryScope): Promise<{ ok: boolean; error?: string }> {
    const params = this.getScopeParams(scope)
    
    try {
      const result = await this.withTimeout(
        this.getClient().deleteAll(params),
        null,
        REQUEST_TIMEOUT_MS * 2
      )
      
      if (!result) {
        return { ok: false, error: "Timeout or API error" }
      }
      
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  }
}

export function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}
