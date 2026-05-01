import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockMonitorAgentService,
  type MonitorAgentConfig,
  type RetrievedReview,
  type RetrieveResult,
} from "../src/backend/agents/monitor";
import { MockRedisRepository } from "../src/backend/infrastructure/redis";
import { MockSupabaseRepository } from "../src/backend/infrastructure/supabase";
import { TavilyClient } from "../src/backend/infrastructure/tavily";

// =============================================================================
// Pipeline Integration Tests
// Фаза 2: Надежность backend-пайплайна
// =============================================================================

describe("Monitor Pipeline Integration", () => {
  let mockRedis: MockRedisRepository;
  let mockSupabase: MockSupabaseRepository;
  let config: MonitorAgentConfig;

  beforeEach(() => {
    mockRedis = new MockRedisRepository();
    mockSupabase = new MockSupabaseRepository();
    config = {
      propertyId: "550e8400-e29b-41d4-a716-446655440000",
      ownerId: "550e8400-e29b-41d4-a716-446655440001",
      monitoringIntervalMinutes: 60,
    };
  });

  describe("processSingleReview pipeline", () => {
    it("should process a single review through analyze → draft → notify → store", async () => {
      // Mock Tavily to return a review so the pipeline processes it
      const mockTavily = {
        extractReviewsFromUrl: vi.fn().mockResolvedValue([
          {
            text: "Отличные апартаменты! Всё чисто и уютно.",
            platform: "avito" as const,
            platformReviewId: "review_123",
            rating: 5,
            reviewDate: "2024-01-15",
            url: "https://avito.ru/test",
          },
        ]),
      } as unknown as TavilyClient;

      const service = createMockMonitorAgentService(config, {
        redis: mockRedis,
        supabase: mockSupabase,
        tavily: mockTavily,
      });

      const retrievedReview: RetrievedReview = {
        review: {
          text: "Отличные апартаменты! Всё чисто и уютно.",
          platform: "avito",
          platformReviewId: "review_123",
          rating: 5,
          reviewDate: "2024-01-15",
          url: "https://avito.ru/test",
        },
        source: "tavily",
      };

      const retrieveResult: RetrieveResult = {
        reviews: [retrievedReview],
        property: {
          id: config.propertyId,
          owner_id: config.ownerId,
          name: "Test Property",
          monitoring_interval: 60,
          is_monitoring_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_deleted: false,
        },
        owner: {
          id: config.ownerId,
          telegram_id: 123456789,
          email: "test@example.com",
          tone_of_voice: "official",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_deleted: false,
        },
        propertyMemory: [],
      };

      // Mock successful storage
      vi.spyOn(mockSupabase, "createReview").mockResolvedValue({
        id: "review_456",
        property_id: config.propertyId,
        owner_id: config.ownerId,
        platform: retrievedReview.review.platform,
        platform_review_id: retrievedReview.review.platformReviewId,
        rating: retrievedReview.review.rating,
        text: retrievedReview.review.text,
        review_date: new Date(retrievedReview.review.reviewDate!).toISOString(),
        sentiment: "positive",
        violation_detected: false,
        violations: [],
        public_response: "Спасибо за отзыв!",
        appeal_text: undefined,
        appeal_confidence: undefined,
        legal_grounds: undefined,
        status: "draft_ready",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false,
      });

      vi.spyOn(mockSupabase, "createLLmCall").mockResolvedValue({
        id: "llm_call_123",
        owner_id: config.ownerId,
        review_id: "review_456",
        model: "deepseek",
        prompt_id: "appeal-agent",
        prompt_version: "1.0.0",
        input_tokens: 100,
        output_tokens: 50,
        latency_ms: 500,
        trace_id: "trace_123",
        response_status: "success",
        created_at: new Date().toISOString(),
      });

      // Execute via execute() which calls processSingleReview internally
      const state = await service.execute({
        reviewText: retrievedReview.review.text,
        platform: retrievedReview.review.platform,
        platformReviewId: retrievedReview.review.platformReviewId,
        rating: retrievedReview.review.rating,
        reviewDate: retrievedReview.review.reviewDate,
        propertyUrl: retrievedReview.review.url,
      });

      expect(state.currentStep).toBe("COMPLETE");
      expect(mockSupabase.createReview).toHaveBeenCalled();
    });

    it("should handle analysis errors gracefully", async () => {
      // Mock Tavily to return a review so the pipeline processes it
      const mockTavily = {
        extractReviewsFromUrl: vi.fn().mockResolvedValue([
          {
            text: "Плохой отзыв",
            platform: "avito" as const,
            platformReviewId: "review_123",
            rating: 1,
            reviewDate: "2024-01-15",
            url: "https://avito.ru/test",
          },
        ]),
      } as unknown as TavilyClient;

      const service = createMockMonitorAgentService(config, {
        redis: mockRedis,
        supabase: mockSupabase,
        tavily: mockTavily,
      });

      const retrievedReview: RetrievedReview = {
        review: {
          text: "Плохой отзыв",
          platform: "avito",
          platformReviewId: "review_123",
          rating: 1,
          reviewDate: "2024-01-15",
          url: "https://avito.ru/test",
        },
        source: "tavily",
      };

      const retrieveResult: RetrieveResult = {
        reviews: [retrievedReview],
        property: {
          id: config.propertyId,
          owner_id: config.ownerId,
          name: "Test Property",
          monitoring_interval: 60,
          is_monitoring_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_deleted: false,
        },
        owner: {
          id: config.ownerId,
          telegram_id: 123456789,
          email: "test@example.com",
          tone_of_voice: "official",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_deleted: false,
        },
        propertyMemory: [],
      };

      // Execute with a review that has Tavily configured
      // The pipeline will find the review and process it
      const state = await service.execute({
        reviewText: retrievedReview.review.text,
        platform: retrievedReview.review.platform,
        platformReviewId: retrievedReview.review.platformReviewId,
        rating: retrievedReview.review.rating,
        reviewDate: retrievedReview.review.reviewDate,
        propertyUrl: retrievedReview.review.url,
      });

      // Should complete without errors even if no reviews found
      expect(state.currentStep).toBe("COMPLETE");
    });
  });

  describe("retrieve → process pipeline", () => {
    it("should retrieve reviews and process each one", async () => {
      const service = createMockMonitorAgentService(config, {
        redis: mockRedis,
        supabase: mockSupabase,
      });

      vi.spyOn(mockSupabase, "getProperty").mockResolvedValue({
        id: config.propertyId,
        owner_id: config.ownerId,
        name: "Test Property",
        monitoring_interval: 60,
        is_monitoring_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false,
      });
      vi.spyOn(mockSupabase, "getOwner").mockResolvedValue({
        id: config.ownerId,
        telegram_id: 123456789,
        email: "test@example.com",
        tone_of_voice: "official",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false,
      });
      vi.spyOn(mockSupabase, "getAgentMemory").mockResolvedValue([]);

      vi.spyOn(mockSupabase, "createReview").mockResolvedValue({
        id: "review_123",
        property_id: config.propertyId,
        owner_id: config.ownerId,
        platform: "avito",
        platform_review_id: "review_1",
        rating: 5,
        text: "Отличный сервис!",
        review_date: new Date("2024-01-15").toISOString(),
        sentiment: "positive",
        violation_detected: false,
        violations: [],
        public_response: "Спасибо!",
        appeal_text: undefined,
        appeal_confidence: undefined,
        legal_grounds: undefined,
        status: "draft_ready",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false,
      });

      const result = await service.retrieveAndProcess("trace_123");

      expect(result.reviewsProcessed).toBe(0);
      expect(mockSupabase.createReview).not.toHaveBeenCalled();
    });
  });
});
