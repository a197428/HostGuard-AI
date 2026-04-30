import { describe, it, expect, beforeAll } from "vitest";
import {
  // Supabase table schemas
  OwnerSchema,
  PropertySchema,
  PropertyUrlSchema,
  ReviewSchema,
  LLmCallSchema,
  FeatureFlagSchema,
  AgentMemorySchema,
  // AI response schemas
  AppealAgentResponseSchema,
  StayVerificationSchema,
  ViolationSchema,
  LegalGroundSchema,
  PublicResponseSchema,
  AppealSchema,
  RecommendationSchema,
  // Enums
  PlatformSchema,
  SentimentSchema,
  ReviewStatusSchema,
  ViolationTypeSchema,
  AgentMemoryLevelSchema,
  LLMProviderSchema,
  LegalGroundSourceSchema,
  AppealRecommendationActionSchema,
  // Helpers
  validateSchema,
  safeValidateSchema,
} from "../src/shared/schemas";

describe("Supabase Table Schemas", () => {
  describe("OwnerSchema", () => {
    it("should validate a valid owner", () => {
      const validOwner = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "owner@example.com",
        telegram_id: 123456789,
        tone_of_voice: "official",
        greeting_template: "С уважением",
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
        is_deleted: false,
      };

      const result = validateSchema(OwnerSchema, validOwner);
      expect(result.email).toBe("owner@example.com");
    });

    it("should fail on invalid email", () => {
      const invalidOwner = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "not-an-email",
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      expect(() => validateSchema(OwnerSchema, invalidOwner)).toThrow();
    });

    it("should fail on invalid UUID", () => {
      const invalidOwner = {
        id: "not-a-uuid",
        email: "owner@example.com",
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      expect(() => validateSchema(OwnerSchema, invalidOwner)).toThrow();
    });

    it("should apply default values", () => {
      const minimalOwner = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "owner@example.com",
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      const result = validateSchema(OwnerSchema, minimalOwner);
      expect(result.is_deleted).toBe(false);
    });
  });

  describe("PropertySchema", () => {
    it("should validate a valid property", () => {
      const validProperty = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        owner_id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Апартаменты на Пушкина",
        address: "Москва, ул. Пушкина, д. 10",
        features: { rooms: 2, area: 45 },
        typical_complaints: ["шум", "парковка"],
        monitoring_interval: 120,
        is_monitoring_active: true,
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
        is_deleted: false,
      };

      const result = validateSchema(PropertySchema, validProperty);
      expect(result.name).toBe("Апартаменты на Пушкина");
      expect(result.monitoring_interval).toBe(120);
    });

    it("should fail on missing required fields", () => {
      const invalidProperty = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        // missing owner_id and name
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      expect(() => validateSchema(PropertySchema, invalidProperty)).toThrow();
    });

    it("should accept monitoring_interval boundaries", () => {
      // PropertySchema doesn't constrain monitoring_interval to positive values
      // so negative values are technically valid - business logic enforces positivity
      const property = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        owner_id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Test Property",
        monitoring_interval: -10, // valid in schema, business logic should enforce > 0
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      const result = validateSchema(PropertySchema, property);
      expect(result.monitoring_interval).toBe(-10);
    });
  });

  describe("PropertyUrlSchema", () => {
    it("should validate a valid property URL", () => {
      const validUrl = {
        id: "550e8400-e29b-41d4-a716-446655440002",
        property_id: "550e8400-e29b-41d4-a716-446655440001",
        platform: "avito",
        url: "https://avito.ru/item/123456789",
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      const result = validateSchema(PropertyUrlSchema, validUrl);
      expect(result.platform).toBe("avito");
    });

    it("should reject invalid platform", () => {
      const invalidUrl = {
        id: "550e8400-e29b-41d4-a716-446655440002",
        property_id: "550e8400-e29b-41d4-a716-446655440001",
        platform: "booking", // not a valid platform
        url: "https://booking.com/property/123",
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      expect(() => validateSchema(PropertyUrlSchema, invalidUrl)).toThrow();
    });

    it("should fail on invalid URL", () => {
      const invalidUrl = {
        id: "550e8400-e29b-41d4-a716-446655440002",
        property_id: "550e8400-e29b-41d4-a716-446655440001",
        platform: "avito",
        url: "not-a-url",
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      expect(() => validateSchema(PropertyUrlSchema, invalidUrl)).toThrow();
    });
  });

  describe("ReviewSchema", () => {
    it("should validate a valid review", () => {
      const validReview = {
        id: "550e8400-e29b-41d4-a716-446655440003",
        property_id: "550e8400-e29b-41d4-a716-446655440001",
        owner_id: "550e8400-e29b-41d4-a716-446655440000",
        platform: "ostrovok",
        platform_review_id: "review_123",
        rating: 3,
        text: "Средний отзыв о проживании",
        sentiment: "neutral",
        violation_detected: false,
        status: "new",
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
        is_deleted: false,
      };

      const result = validateSchema(ReviewSchema, validReview);
      expect(result.rating).toBe(3);
      expect(result.sentiment).toBe("neutral");
    });

    it("should fail on rating out of range", () => {
      const invalidReview = {
        id: "550e8400-e29b-41d4-a716-446655440003",
        property_id: "550e8400-e29b-41d4-a716-446655440001",
        owner_id: "550e8400-e29b-41d4-a716-446655440000",
        platform: "avito",
        platform_review_id: "review_123",
        rating: 10, // invalid, must be 1-5
        text: "Test review",
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      expect(() => validateSchema(ReviewSchema, invalidReview)).toThrow();
    });

    it("should fail on invalid status", () => {
      const invalidReview = {
        id: "550e8400-e29b-41d4-a716-446655440003",
        property_id: "550e8400-e29b-41d4-a716-446655440001",
        owner_id: "550e8400-e29b-41d4-a716-446655440000",
        platform: "avito",
        platform_review_id: "review_123",
        rating: 3,
        text: "Test review",
        status: "invalid_status",
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      expect(() => validateSchema(ReviewSchema, invalidReview)).toThrow();
    });
  });

  describe("LLmCallSchema", () => {
    it("should validate a valid LLM call", () => {
      const validCall = {
        id: "550e8400-e29b-41d4-a716-446655440004",
        owner_id: "550e8400-e29b-41d4-a716-446655440000",
        review_id: "550e8400-e29b-41d4-a716-446655440003",
        model: "deepseek",
        prompt_id: "appeal-agent",
        prompt_version: "1.0.0",
        input_tokens: 1500,
        output_tokens: 500,
        latency_ms: 2500,
        trace_id: "trace_abc123",
        response_status: "success",
        created_at: "2026-04-30T00:00:00Z",
      };

      const result = validateSchema(LLmCallSchema, validCall);
      expect(result.model).toBe("deepseek");
      expect(result.latency_ms).toBe(2500);
    });

    it("should fail on invalid model", () => {
      const invalidCall = {
        id: "550e8400-e29b-41d4-a716-446655440004",
        owner_id: "550e8400-e29b-41d4-a716-446655440000",
        model: "claude",
        prompt_id: "appeal-agent",
        prompt_version: "1.0.0",
        input_tokens: 1500,
        output_tokens: 500,
        latency_ms: 2500,
        trace_id: "trace_abc123",
        response_status: "success",
        created_at: "2026-04-30T00:00:00Z",
      };

      expect(() => validateSchema(LLmCallSchema, invalidCall)).toThrow();
    });
  });

  describe("FeatureFlagSchema", () => {
    it("should validate a valid feature flag", () => {
      const validFlag = {
        id: "550e8400-e29b-41d4-a716-446655440005",
        name: "new_appeal_prompt",
        enabled: true,
        rollout_percentage: 10,
        owner_ids: ["550e8400-e29b-41d4-a716-446655440000"],
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      const result = validateSchema(FeatureFlagSchema, validFlag);
      expect(result.rollout_percentage).toBe(10);
    });

    it("should fail on rollout_percentage > 100", () => {
      const invalidFlag = {
        id: "550e8400-e29b-41d4-a716-446655440005",
        name: "new_feature",
        rollout_percentage: 150,
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      expect(() => validateSchema(FeatureFlagSchema, invalidFlag)).toThrow();
    });
  });

  describe("AgentMemorySchema", () => {
    it("should validate a valid agent memory entry", () => {
      const validMemory = {
        id: "550e8400-e29b-41d4-a716-446655440006",
        level: "global",
        scope: "platform:avito",
        content: { rules: ["п. 4.1 Правил Avito"] },
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      const result = validateSchema(AgentMemorySchema, validMemory);
      expect(result.level).toBe("global");
    });

    it("should fail on invalid level", () => {
      const invalidMemory = {
        id: "550e8400-e29b-41d4-a716-446655440006",
        level: "invalid_level",
        content: {},
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
      };

      expect(() => validateSchema(AgentMemorySchema, invalidMemory)).toThrow();
    });
  });
});

describe("AI Response Schemas (from PROMPTS.md)", () => {
  describe("AppealAgentResponseSchema", () => {
    it("should validate a complete AI response with violation", () => {
      const validResponse = {
        review_id: "review_123",
        platform: "avito",
        sentiment: "negative",
        violation_detected: true,
        stay_verification: {
          guest_stayed: true,
          evidence: "Бронирование подтверждено в системе",
        },
        violations: [
          {
            type: "insult",
            description: "Оскорбление в адрес хоста",
            rule_reference: "п. 4.1 Правил Avito",
          },
        ],
        public_response: {
          text: "Спасибо за обратную связь...",
          tone: "вежливый, сдержанный",
        },
        appeal: {
          text: "Прошу удалить отзыв как нарушающий правила...",
          legal_grounds: [
            {
              source: "platform_rules",
              article: "п. 4.1",
              citation: "Запрещены оскорбления в адрес хоста",
            },
          ],
          confidence: 0.85,
        },
        recommendation: {
          action: "approve",
          reason: "Отзыв содержит явное оскорбление",
        },
      };

      const result = validateSchema(AppealAgentResponseSchema, validResponse);
      expect(result.violation_detected).toBe(true);
      expect(result.appeal?.confidence).toBe(0.85);
    });

    it("should validate AI response without violation", () => {
      const validResponse = {
        review_id: "review_124",
        platform: "yandex",
        sentiment: "neutral",
        violation_detected: false,
        stay_verification: {
          guest_stayed: true,
          evidence: "Бронирование подтверждено",
        },
        violations: [],
        public_response: {
          text: "Спасибо за ваш отзыв, мы работаем над улучшением...",
          tone: "дружелюбный",
        },
        recommendation: {
          action: "approve",
          reason: "Конструктивная критика",
        },
      };

      const result = validateSchema(AppealAgentResponseSchema, validResponse);
      expect(result.violation_detected).toBe(false);
      expect(result.appeal).toBeUndefined();
    });

    it("should require appeal when violation_detected is true", () => {
      const responseMissingAppeal = {
        review_id: "review_125",
        platform: "ostrovok",
        sentiment: "negative",
        violation_detected: true,
        stay_verification: {
          guest_stayed: null,
          evidence: "Невозможно проверить",
        },
        violations: [
          {
            type: "profanity",
            description: "Нецензурная лексика",
            rule_reference: "п. 3.2",
          },
        ],
        public_response: {
          text: "Спасибо за отзыв...",
          tone: "нейтральный",
        },
        recommendation: {
          action: "review_carefully",
          reason: "Требуется проверка",
        },
      };

      expect(() =>
        validateSchema(AppealAgentResponseSchema, responseMissingAppeal),
      ).toThrow();
    });

    it("should fail on invalid sentiment", () => {
      const invalidResponse = {
        review_id: "review_126",
        platform: "avito",
        sentiment: "very_negative", // invalid
        violation_detected: false,
        stay_verification: {
          guest_stayed: true,
          evidence: "ok",
        },
        violations: [],
        public_response: {
          text: "Thanks",
          tone: "ok",
        },
        recommendation: {
          action: "approve",
          reason: "ok",
        },
      };

      expect(() =>
        validateSchema(AppealAgentResponseSchema, invalidResponse),
      ).toThrow();
    });

    it("should fail on invalid recommendation action", () => {
      const invalidResponse = {
        review_id: "review_127",
        platform: "avito",
        sentiment: "negative",
        violation_detected: false,
        stay_verification: {
          guest_stayed: true,
          evidence: "ok",
        },
        violations: [],
        public_response: {
          text: "Thanks",
          tone: "ok",
        },
        recommendation: {
          action: "invalid_action", // invalid
          reason: "ok",
        },
      };

      expect(() =>
        validateSchema(AppealAgentResponseSchema, invalidResponse),
      ).toThrow();
    });

    it("should validate confidence bounds", () => {
      const validResponse = {
        review_id: "review_128",
        platform: "avito",
        sentiment: "negative",
        violation_detected: true,
        stay_verification: {
          guest_stayed: true,
          evidence: "ok",
        },
        violations: [
          {
            type: "insult",
            description: "Insult",
            rule_reference: "rule",
          },
        ],
        public_response: {
          text: "text",
          tone: "tone",
        },
        appeal: {
          text: "appeal text",
          legal_grounds: [
            {
              source: "platform_rules",
              article: "art",
              citation: "cit",
            },
          ],
          confidence: 1.0, // max valid
        },
        recommendation: {
          action: "approve",
          reason: "reason",
        },
      };

      const result = validateSchema(AppealAgentResponseSchema, validResponse);
      expect(result.appeal?.confidence).toBe(1.0);
    });
  });

  describe("Enums", () => {
    it.each([
      ["PlatformSchema", PlatformSchema, "avito", "ostrovok", "yandex"],
      ["SentimentSchema", SentimentSchema, "positive", "neutral", "negative"],
      [
        "ReviewStatusSchema",
        ReviewStatusSchema,
        "new",
        "draft_ready",
        "approved",
        "edited",
        "rejected",
        "appeal_sent",
        "appeal_success",
        "appeal_denied",
      ],
      [
        "ViolationTypeSchema",
        ViolationTypeSchema,
        "insult",
        "profanity",
        "personal_data",
        "competitor_ads",
        "discrimination",
      ],
      [
        "AgentMemoryLevelSchema",
        AgentMemoryLevelSchema,
        "global",
        "local",
        "tactical",
      ],
      ["LLMProviderSchema", LLMProviderSchema, "deepseek", "gpt-4o-mini"],
      [
        "LegalGroundSourceSchema",
        LegalGroundSourceSchema,
        "platform_rules",
        "gk_rf",
        "uk_rf",
      ],
      [
        "AppealRecommendationActionSchema",
        AppealRecommendationActionSchema,
        "approve",
        "review_carefully",
        "reject",
      ],
    ])("%s should validate all enum values", (_, schema, ...values) => {
      values.forEach((value) => {
        expect(() => validateSchema(schema, value)).not.toThrow();
      });
    });
  });

  describe("safeValidateSchema", () => {
    it("should return success for valid data", () => {
      const validData = {
        review_id: "review_test",
        platform: "avito",
        sentiment: "positive",
        violation_detected: false,
        stay_verification: {
          guest_stayed: true,
          evidence: "test",
        },
        violations: [],
        public_response: {
          text: "Great!",
          tone: "friendly",
        },
        recommendation: {
          action: "approve",
          reason: "Good review",
        },
      };

      const result = safeValidateSchema(AppealAgentResponseSchema, validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.review_id).toBe("review_test");
      }
    });

    it("should return error for invalid data", () => {
      const invalidData = {
        review_id: "review_test",
        platform: "invalid_platform",
        sentiment: "positive",
        violation_detected: false,
        stay_verification: {
          guest_stayed: true,
          evidence: "test",
        },
        violations: [],
        public_response: {
          text: "Great!",
          tone: "friendly",
        },
        recommendation: {
          action: "approve",
          reason: "Good review",
        },
      };

      const result = safeValidateSchema(AppealAgentResponseSchema, invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
