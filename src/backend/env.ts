export interface Env {
  MonitorAgent: DurableObjectNamespace;
  AI_GATEWAY?: Ai;
  CACHE?: KVNamespace;
  RATE_LIMIT?: unknown;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  OPENROUTER_API_KEY?: string;
  ROUTERAI_API_KEY?: string;
  ROUTERAI_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
  UPSTASH_REDIS_URL?: string;
  UPSTASH_REDIS_TOKEN?: string;
}
