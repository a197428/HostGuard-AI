// =============================================================================
// Rate Limiter for HostGuard AI API
// In-memory sliding window rate limiter for Cloudflare Workers
// =============================================================================

import { logStructured } from "./logging";

// =============================================================================
// Types
// =============================================================================

export interface RateLimiterConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  burstMaxRequests?: number; // Optional burst limit (higher than maxRequests)
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

// =============================================================================
// In-memory sliding window rate limiter
// =============================================================================

interface WindowEntry {
  timestamps: number[];
}

export class InMemoryRateLimiter {
  private windows = new Map<string, WindowEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: RateLimiterConfig,
    private readonly cleanupMs = 60_000, // Cleanup every 60s
  ) {
    if (typeof globalThis !== "undefined") {
      this.cleanupInterval = setInterval(() => this.cleanup(), this.cleanupMs);
      if (
        this.cleanupInterval &&
        typeof this.cleanupInterval === "object" &&
        "unref" in this.cleanupInterval
      ) {
        (this.cleanupInterval as unknown as { unref: () => void }).unref();
      }
    }
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let entry = this.windows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    const burstLimit = this.config.burstMaxRequests ?? this.config.maxRequests;
    const currentCount = entry.timestamps.length;

    if (currentCount >= burstLimit) {
      const oldestTimestamp = entry.timestamps[0] ?? now;
      const retryAfterMs = oldestTimestamp + this.config.windowMs - now;

      logStructured("warn", {
        trace_id: `rate_limit_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: `Rate limit exceeded for key "${key}"`,
        data: {
          current_count: currentCount,
          max_requests: this.config.maxRequests,
          burst_limit: burstLimit,
          retry_after_ms: Math.max(0, retryAfterMs),
        },
      });

      return {
        allowed: false,
        remaining: 0,
        resetAt: oldestTimestamp + this.config.windowMs,
        retryAfterMs: Math.max(0, retryAfterMs),
      };
    }

    entry.timestamps.push(now);

    return {
      allowed: true,
      remaining: burstLimit - currentCount - 1,
      resetAt: now + this.config.windowMs,
      retryAfterMs: 0,
    };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [key, entry] of this.windows.entries()) {
      entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
      if (entry.timestamps.length === 0) {
        this.windows.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.windows.clear();
  }
}

// =============================================================================
// Rate limiters for different API endpoints
// =============================================================================

export const API_RATE_LIMITERS = {
  // General API: 100 requests per minute
  general: new InMemoryRateLimiter({
    windowMs: 60_000,
    maxRequests: 100,
    burstMaxRequests: 150,
  }),

  // Auth endpoints: 10 requests per minute
  auth: new InMemoryRateLimiter({
    windowMs: 60_000,
    maxRequests: 10,
    burstMaxRequests: 20,
  }),

  // Telegram webhook: 30 requests per minute
  telegram: new InMemoryRateLimiter({
    windowMs: 60_000,
    maxRequests: 30,
    burstMaxRequests: 50,
  }),

  // Review creation: 20 requests per minute
  reviewCreate: new InMemoryRateLimiter({
    windowMs: 60_000,
    maxRequests: 20,
    burstMaxRequests: 30,
  }),

  // Property CRUD: 30 requests per minute
  property: new InMemoryRateLimiter({
    windowMs: 60_000,
    maxRequests: 30,
    burstMaxRequests: 50,
  }),
};

// =============================================================================
// Rate limit middleware for Hono
// =============================================================================

import type { Context, Next } from "hono";
import type { Env } from "../env";

export function rateLimitMiddleware(
  limiter: InMemoryRateLimiter,
  keyPrefix = "api",
) {
  return async (
    c: Context<{ Bindings: Env }>,
    next: Next,
  ): Promise<Response | void> => {
    // Skip rate limiting for health checks
    const url = new URL(c.req.url);
    if (url.pathname === "/healthz" || url.pathname === "/api/healthz") {
      return next();
    }

    // Build rate limit key from IP or user ID
    const ip =
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for") ??
      "unknown";
    const authHeader = c.req.header("authorization");
    const userId = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).slice(0, 12)
      : "anon";
    const key = `${keyPrefix}:${userId}:${ip}`;

    const result = limiter.check(key);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(limiter["config"].maxRequests));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      c.header("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
      return c.json(
        {
          error: "Too many requests",
          retry_after_seconds: Math.ceil(result.retryAfterMs / 1000),
        },
        429,
      );
    }

    return next();
  };
}
