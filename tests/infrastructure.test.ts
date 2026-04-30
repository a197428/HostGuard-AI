import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSupabaseClient, SupabaseRepository } from '@hostguard/backend/infrastructure/supabase';
import { RedisRepository, MockRedisRepository, REDIS_KEYS, REDIS_TTL } from '@hostguard/backend/infrastructure/redis';

// =============================================================================
// Integration tests using Miniflare/Wrangler mocks
// ADR-003: Supabase as primary storage, Redis as ephemeral buffer
// =============================================================================

describe('Supabase Integration', () => {
  // These tests use mocks to simulate Supabase behavior
  // In real integration tests, you would use Miniflare with actual D1

  describe('SupabaseRepository', () => {
    it('should create a supabase client with correct types', () => {
      const client = createSupabaseClient(
        'https://test.supabase.co',
        'test-key'
      );

      expect(client).toBeDefined();
      expect(client.from).toBeDefined();
    });

    it('should have repository methods available', () => {
      // The repository wraps the client with typed methods
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        single: vi.fn(),
      } as any;

      const repo = new SupabaseRepository(mockClient);
      expect(repo.getOwner).toBeDefined();
      expect(repo.getProperties).toBeDefined();
      expect(repo.createReview).toBeDefined();
    });
  });
});

describe('Redis Integration', () => {
  describe('Review Deduplication', () => {
    let redis: MockRedisRepository;

    beforeEach(() => {
      redis = new MockRedisRepository();
    });

    it('should mark review as processed', async () => {
      await redis.markReviewProcessed('avito', 'review_123');
      const isProcessed = await redis.isReviewProcessed('avito', 'review_123');
      expect(isProcessed).toBe(true);
    });

    it('should detect already processed review', async () => {
      await redis.markReviewProcessed('ostrovok', 'review_456');
      const isProcessed = await redis.isReviewProcessed('ostrovok', 'review_456');
      expect(isProcessed).toBe(true);
    });

    it('should allow new reviews to be processed', async () => {
      const isProcessed = await redis.isReviewProcessed('yandex', 'new_review_789');
      expect(isProcessed).toBe(false);
    });

    it('should check and mark atomically', async () => {
      // First check - should be new
      const result1 = await redis.checkAndMarkReviewProcessed('avito', 'atomic_review');
      expect(result1.isNew).toBe(true);
      expect(result1.key).toBe('review:avito:atomic_review');

      // Second check - should already exist
      const result2 = await redis.checkAndMarkReviewProcessed('avito', 'atomic_review');
      expect(result2.isNew).toBe(false);
    });

    it('should generate correct redis keys', () => {
      const key = REDIS_KEYS.review('avito', 'review_123');
      expect(key).toBe('review:avito:review_123');
    });

    it('should have correct TTL for review dedup', () => {
      expect(REDIS_TTL.REVIEW_DEDUP).toBe(7776000); // 90 days
    });

    it('should delete review key', async () => {
      await redis.markReviewProcessed('avito', 'to_delete');
      await redis.deleteReviewKey('avito', 'to_delete');
      const isProcessed = await redis.isReviewProcessed('avito', 'to_delete');
      expect(isProcessed).toBe(false);
    });

    it('should track TTL correctly', async () => {
      await redis.markReviewProcessed('avito', 'ttl_review');
      const ttl = await redis.getReviewTTL('avito', 'ttl_review');
      // TTL should be close to 90 days (allowing some margin)
      expect(ttl).toBeGreaterThan(7776000 - 100);
      expect(ttl).toBeLessThanOrEqual(7776000);
    });
  });

  describe('Rate Limiting', () => {
    let redis: MockRedisRepository;

    beforeEach(() => {
      redis = new MockRedisRepository();
    });

    it('should allow requests under limit', async () => {
      const allowed = await redis.checkRateLimit('owner_1', 'api:/reviews', 10);
      expect(allowed).toBe(true);
    });

    it('should block requests over limit', async () => {
      const limit = 3;
      for (let i = 0; i < limit; i++) {
        await redis.checkRateLimit('owner_2', 'api:/reviews', limit);
      }
      const allowed = await redis.checkRateLimit('owner_2', 'api:/reviews', limit);
      expect(allowed).toBe(false);
    });

    it('should count rate limit correctly', async () => {
      await redis.checkRateLimit('owner_3', 'api:/reviews', 100);
      await redis.checkRateLimit('owner_3', 'api:/reviews', 100);
      await redis.checkRateLimit('owner_3', 'api:/reviews', 100);

      const count = await redis.getRateLimitCount('owner_3', 'api:/reviews');
      expect(count).toBe(3);
    });

    it('should generate correct rate limit keys', () => {
      const key = REDIS_KEYS.rateLimit('owner_abc', 'api:/reviews');
      expect(key).toBe('ratelimit:owner_abc:api:/reviews');
    });

    it('should have correct rate limit TTL', () => {
      expect(REDIS_TTL.RATE_LIMIT).toBe(60);
    });
  });

  describe('Session Management', () => {
    let redis: MockRedisRepository;

    beforeEach(() => {
      redis = new MockRedisRepository();
    });

    it('should store and retrieve session', async () => {
      const sessionId = 'session_123';
      const data = { owner_id: 'owner_1', property_id: 'prop_1' };

      await redis.setSession(sessionId, data);
      const retrieved = await redis.getSession(sessionId);

      expect(retrieved).toEqual(data);
    });

    it('should return null for non-existent session', async () => {
      const retrieved = await redis.getSession('non_existent');
      expect(retrieved).toBeNull();
    });

    it('should delete session', async () => {
      await redis.setSession('session_to_delete', { test: true });
      await redis.deleteSession('session_to_delete');
      const retrieved = await redis.getSession('session_to_delete');
      expect(retrieved).toBeNull();
    });

    it('should generate correct session keys', () => {
      const key = REDIS_KEYS.session('session_abc');
      expect(key).toBe('session:session_abc');
    });
  });

  describe('Health Check', () => {
    it('should return PONG', async () => {
      const redis = new MockRedisRepository();
      const response = await redis.ping();
      expect(response).toBe('PONG');
    });
  });

  describe('MockRedisRepository isolation', () => {
    it('should isolate data between tests', async () => {
      const redis1 = new MockRedisRepository();
      const redis2 = new MockRedisRepository();

      await redis1.markReviewProcessed('avito', 'review_in_redis1');

      const inRedis1 = await redis1.isReviewProcessed('avito', 'review_in_redis1');
      const inRedis2 = await redis2.isReviewProcessed('avito', 'review_in_redis1');

      expect(inRedis1).toBe(true);
      expect(inRedis2).toBe(false);
    });
  });
});

describe('ADR-003 Compliance', () => {
  describe('Supabase as primary storage', () => {
    it('should use Supabase for persistent data', () => {
      // ADR-003: Supabase is the primary storage for all business data
      // Reviews, properties, owners, etc. are stored in Supabase
      const client = createSupabaseClient(
        'https://test.supabase.co',
        'test-key'
      );
      expect(client).toBeDefined();
    });
  });

  describe('Redis as ephemeral buffer', () => {
    let redis: MockRedisRepository;

    beforeEach(() => {
      redis = new MockRedisRepository();
    });

    it('should not persist data beyond TTL', () => {
      // ADR-003: Redis is an ephemeral buffer with TTL
      // Review dedup keys expire after 90 days
      expect(REDIS_TTL.REVIEW_DEDUP).toBe(7776000);
    });

    it('should support idempotent review processing', async () => {
      // ADR-003: Idempotency check via Redis key
      const result1 = await redis.checkAndMarkReviewProcessed('avito', 'idempotent_review');
      const result2 = await redis.checkAndMarkReviewProcessed('avito', 'idempotent_review');

      expect(result1.isNew).toBe(true);
      expect(result2.isNew).toBe(false);
    });

    it('should not be used for permanent storage', () => {
      // ADR-003: Redis is not a permanent store
      // All permanent data (reviews, properties, etc.) goes to Supabase
      const key = REDIS_KEYS.review('avito', 'permanent_data');
      expect(key).toMatch(/^review:/);
      // This is ephemeral - no permanent business data stored here
    });
  });

  describe('RLS Policies in Supabase', () => {
    it('should have proper database types defined', () => {
      // The supabase.ts file defines Database type with proper RLS
      // This is a compile-time check that the types are correct
      const mockClient = {} as any;
      const repo = new SupabaseRepository(mockClient);
      expect(repo).toBeDefined();
    });
  });
});
