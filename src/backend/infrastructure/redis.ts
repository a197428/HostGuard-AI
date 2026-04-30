import { Redis } from "@upstash/redis";

// =============================================================================
// Upstash Redis Client for Review Deduplication
// ADR-003: Supabase as primary storage, Redis as ephemeral buffer (TTL 90 days)
// =============================================================================

export interface RedisConfig {
  url: string;
  token: string;
}

export interface DedupResult {
  isNew: boolean;
  key: string;
}

// Key generators following DATA_MODEL.md section 3.1
export const REDIS_KEYS = {
  review: (platform: string, platformReviewId: string): string =>
    `review:${platform}:${platformReviewId}`,

  rateLimit: (ownerId: string, endpoint: string): string =>
    `ratelimit:${ownerId}:${endpoint}`,

  session: (sessionId: string): string => `session:${sessionId}`,
} as const;

// TTL values in seconds (from DATA_MODEL.md)
export const REDIS_TTL = {
  REVIEW_DEDUP: 7776000, // 90 days = 90 * 24 * 60 * 60
  RATE_LIMIT: 60, // 60 seconds (sliding window)
  SESSION: 86400, // 24 hours
} as const;

// =============================================================================
// Redis Repository Interface
// =============================================================================

export interface IRedisRepository {
  isReviewProcessed(
    platform: string,
    platformReviewId: string,
  ): Promise<boolean>;
  markReviewProcessed(
    platform: string,
    platformReviewId: string,
  ): Promise<void>;
  checkAndMarkReviewProcessed(
    platform: string,
    platformReviewId: string,
  ): Promise<DedupResult>;
  getReviewTTL(platform: string, platformReviewId: string): Promise<number>;
  deleteReviewKey(platform: string, platformReviewId: string): Promise<void>;
  checkRateLimit(
    ownerId: string,
    endpoint: string,
    limit?: number,
  ): Promise<boolean>;
  getRateLimitCount(ownerId: string, endpoint: string): Promise<number>;
  setSession(sessionId: string, data: Record<string, unknown>): Promise<void>;
  getSession<T = Record<string, unknown>>(sessionId: string): Promise<T | null>;
  deleteSession(sessionId: string): Promise<void>;
  ping(): Promise<string>;
}

// =============================================================================
// Mock Redis for testing (Miniflare/Workers)
// =============================================================================

export class MockRedisRepository implements IRedisRepository {
  private store: Map<string, { value: string; expireAt?: number }> = new Map();

  async isReviewProcessed(
    platform: string,
    platformReviewId: string,
  ): Promise<boolean> {
    const key = REDIS_KEYS.review(platform, platformReviewId);
    return this.store.has(key);
  }

  async markReviewProcessed(
    platform: string,
    platformReviewId: string,
  ): Promise<void> {
    const key = REDIS_KEYS.review(platform, platformReviewId);
    this.store.set(key, {
      value: "processed",
      expireAt: Date.now() + REDIS_TTL.REVIEW_DEDUP * 1000,
    });
  }

  async checkAndMarkReviewProcessed(
    platform: string,
    platformReviewId: string,
  ): Promise<DedupResult> {
    const key = REDIS_KEYS.review(platform, platformReviewId);

    if (this.store.has(key)) {
      return { isNew: false, key };
    }

    this.store.set(key, {
      value: "processed",
      expireAt: Date.now() + REDIS_TTL.REVIEW_DEDUP * 1000,
    });

    return { isNew: true, key };
  }

  async getReviewTTL(
    platform: string,
    platformReviewId: string,
  ): Promise<number> {
    const key = REDIS_KEYS.review(platform, platformReviewId);
    const entry = this.store.get(key);
    if (!entry || !entry.expireAt) return -1;
    return Math.max(0, Math.floor((entry.expireAt - Date.now()) / 1000));
  }

  async deleteReviewKey(
    platform: string,
    platformReviewId: string,
  ): Promise<void> {
    const key = REDIS_KEYS.review(platform, platformReviewId);
    this.store.delete(key);
  }

  private rateLimitStore: Map<string, { count: number; expireAt: number }> =
    new Map();

  async checkRateLimit(
    ownerId: string,
    endpoint: string,
    limit: number = 100,
  ): Promise<boolean> {
    const key = REDIS_KEYS.rateLimit(ownerId, endpoint);
    const now = Date.now();

    const entry = this.rateLimitStore.get(key);
    if (!entry || entry.expireAt < now) {
      this.rateLimitStore.set(key, {
        count: 1,
        expireAt: now + REDIS_TTL.RATE_LIMIT * 1000,
      });
      return true;
    }

    if (entry.count >= limit) {
      return false;
    }

    entry.count++;
    return true;
  }

  async getRateLimitCount(ownerId: string, endpoint: string): Promise<number> {
    const key = REDIS_KEYS.rateLimit(ownerId, endpoint);
    const entry = this.rateLimitStore.get(key);
    if (!entry || entry.expireAt < Date.now()) return 0;
    return entry.count;
  }

  private sessionStore: Map<string, { value: string; expireAt: number }> =
    new Map();

  async setSession(
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const key = REDIS_KEYS.session(sessionId);
    this.sessionStore.set(key, {
      value: JSON.stringify(data),
      expireAt: Date.now() + REDIS_TTL.SESSION * 1000,
    });
  }

  async getSession<T = Record<string, unknown>>(
    sessionId: string,
  ): Promise<T | null> {
    const key = REDIS_KEYS.session(sessionId);
    const entry = this.sessionStore.get(key);
    if (!entry || entry.expireAt < Date.now()) return null;
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = REDIS_KEYS.session(sessionId);
    this.sessionStore.delete(key);
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  clear(): void {
    this.store.clear();
    this.rateLimitStore.clear();
    this.sessionStore.clear();
  }
}

// =============================================================================
// Real Redis Repository (for Cloudflare Workers)
// =============================================================================

export class RedisRepository implements IRedisRepository {
  private client: Redis;

  constructor(config: RedisConfig) {
    this.client = new Redis({
      url: config.url,
      token: config.token,
    });
  }

  async isReviewProcessed(
    platform: string,
    platformReviewId: string,
  ): Promise<boolean> {
    const key = REDIS_KEYS.review(platform, platformReviewId);
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  async markReviewProcessed(
    platform: string,
    platformReviewId: string,
  ): Promise<void> {
    const key = REDIS_KEYS.review(platform, platformReviewId);
    await this.client.set(key, "processed", { ex: REDIS_TTL.REVIEW_DEDUP });
  }

  async checkAndMarkReviewProcessed(
    platform: string,
    platformReviewId: string,
  ): Promise<DedupResult> {
    const key = REDIS_KEYS.review(platform, platformReviewId);
    const result = await this.client.set(key, "processed", {
      nx: true,
      ex: REDIS_TTL.REVIEW_DEDUP,
    });
    return { isNew: result === "OK", key };
  }

  async getReviewTTL(
    platform: string,
    platformReviewId: string,
  ): Promise<number> {
    const key = REDIS_KEYS.review(platform, platformReviewId);
    return this.client.ttl(key);
  }

  async deleteReviewKey(
    platform: string,
    platformReviewId: string,
  ): Promise<void> {
    const key = REDIS_KEYS.review(platform, platformReviewId);
    await this.client.del(key);
  }

  async checkRateLimit(
    ownerId: string,
    endpoint: string,
    limit: number = 100,
  ): Promise<boolean> {
    const key = REDIS_KEYS.rateLimit(ownerId, endpoint);
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, REDIS_TTL.RATE_LIMIT);
    }
    return count <= limit;
  }

  async getRateLimitCount(ownerId: string, endpoint: string): Promise<number> {
    const key = REDIS_KEYS.rateLimit(ownerId, endpoint);
    const count = await this.client.get<string>(key);
    return count ? parseInt(count, 10) : 0;
  }

  async setSession(
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const key = REDIS_KEYS.session(sessionId);
    await this.client.set(key, JSON.stringify(data), { ex: REDIS_TTL.SESSION });
  }

  async getSession<T = Record<string, unknown>>(
    sessionId: string,
  ): Promise<T | null> {
    const key = REDIS_KEYS.session(sessionId);
    const data = await this.client.get<string>(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = REDIS_KEYS.session(sessionId);
    await this.client.del(key);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}
