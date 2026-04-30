import { beforeEach, describe, expect, it } from "vitest";
import {
  createMockMonitorAgentService,
  type MonitorAgentConfig,
  type ReviewAnalysisContext,
} from "../src/backend/agents/monitor";
import {
  MockDeepSeekClient,
  type MockLLMResponse,
} from "../src/backend/infrastructure/deepseek";
import { MockRedisRepository } from "../src/backend/infrastructure/redis";

interface GoldenTestCase {
  name: string;
  reviewText: string;
  platform: ReviewAnalysisContext["platform"];
  rating: number;
  expectedSentiment: "positive" | "neutral" | "negative";
  expectedViolationDetected: boolean;
  expectedRecommendation: "approve" | "review_carefully" | "reject";
  response: MockLLMResponse;
}

const GOLDEN_SET: GoldenTestCase[] = [
  {
    name: "Positive review stays positive",
    reviewText:
      "Отличные апартаменты! Чисто, уютно, всё как на фото. Хозяин очень приветливый.",
    platform: "avito",
    rating: 5,
    expectedSentiment: "positive",
    expectedViolationDetected: false,
    expectedRecommendation: "approve",
    response: {
      sentiment: "positive",
      violation_detected: false,
      public_response: {
        text: "Спасибо за тёплый отзыв! Рады, что вам понравилось.",
        tone: "дружелюбный",
      },
      recommendation: {
        action: "approve",
        reason: "Позитивный отзыв без нарушений",
      },
    },
  },
  {
    name: "Negative review with insult",
    reviewText:
      "Хозяин — мошенник, не связывайтесь с ним! Квартира не соответствует описанию.",
    platform: "avito",
    rating: 1,
    expectedSentiment: "negative",
    expectedViolationDetected: true,
    expectedRecommendation: "review_carefully",
    response: {
      sentiment: "negative",
      violation_detected: true,
      public_response: {
        text: "Спасибо за обратную связь. Нам жаль, что у вас остались такие впечатления.",
        tone: "вежливый",
      },
      appeal: {
        text: "Просим рассмотреть отзыв как нарушающий правила площадки.",
        legal_grounds: [
          {
            source: "platform_rules",
            article: "п. 4.1 Правил Avito",
            citation: "Запрещены оскорбления и обвинения без доказательств",
          },
          {
            source: "uk_rf",
            article: "ст. 128.1 УК РФ",
            citation: "Клевета",
          },
        ],
        confidence: 0.91,
      },
      recommendation: {
        action: "review_carefully",
        reason: "Содержит оскорбление и обвинение в мошенничестве",
      },
    },
  },
  {
    name: "Constructive neutral criticism",
    reviewText:
      "В номере было прохладно, не работал обогреватель. В остальном всё нормально.",
    platform: "yandex",
    rating: 3,
    expectedSentiment: "neutral",
    expectedViolationDetected: false,
    expectedRecommendation: "approve",
    response: {
      sentiment: "neutral",
      violation_detected: false,
      public_response: {
        text: "Спасибо за отзыв. Мы обязательно проверим отопление.",
        tone: "спокойный",
      },
      recommendation: {
        action: "approve",
        reason: "Конструктивная критика без нарушений",
      },
    },
  },
  {
    name: "Negative review with profanity",
    reviewText:
      "Ужасное место! Всё было фигово, мат какой-то, не советую никому!",
    platform: "ostrovok",
    rating: 1,
    expectedSentiment: "negative",
    expectedViolationDetected: true,
    expectedRecommendation: "review_carefully",
    response: {
      sentiment: "negative",
      violation_detected: true,
      public_response: {
        text: "Спасибо за обратную связь. Нам жаль, что пребывание не оправдало ожиданий.",
        tone: "сдержанный",
      },
      appeal: {
        text: "Просим удалить отзыв, содержащий нецензурную лексику.",
        legal_grounds: [
          {
            source: "platform_rules",
            article: "п. 2.1 Правил Островок.ру",
            citation: "Запрещены нецензурная лексика и оскорбления",
          },
        ],
        confidence: 0.88,
      },
      recommendation: {
        action: "review_carefully",
        reason: "Найдены нарушения правил площадки",
      },
    },
  },
  {
    name: "Borderline review remains neutral",
    reviewText:
      "Нормальные апартаменты, но за эту цену можно найти лучше. Шумоизоляция слабая.",
    platform: "yandex",
    rating: 3,
    expectedSentiment: "neutral",
    expectedViolationDetected: false,
    expectedRecommendation: "approve",
    response: {
      sentiment: "neutral",
      violation_detected: false,
      public_response: {
        text: "Спасибо за отзыв. Учтём замечания по шумоизоляции.",
        tone: "нейтральный",
      },
      recommendation: {
        action: "approve",
        reason: "Нарушений не обнаружено",
      },
    },
  },
];

describe("Golden Set", () => {
  const config: MonitorAgentConfig = {
    propertyId: "property_test_001",
    ownerId: "owner_test_001",
    monitoringIntervalMinutes: 120,
  };

  let llm: MockDeepSeekClient;
  let redis: MockRedisRepository;

  beforeEach(() => {
    llm = new MockDeepSeekClient();
    redis = new MockRedisRepository();
  });

  it.each(GOLDEN_SET)("$name", async (testCase) => {
    llm.setResponseForReview(testCase.reviewText, testCase.response);

    const service = createMockMonitorAgentService(config, {
      redis,
      llm,
    });

    const context: ReviewAnalysisContext = {
      reviewText: testCase.reviewText,
      platform: testCase.platform,
      platformReviewId: `golden_${testCase.name.replace(/\s+/g, "_").toLowerCase()}`,
      rating: testCase.rating,
      reviewDate: "2026-04-30T00:00:00Z",
    };

    const result = await service.execute(context);

    expect(result.currentStep).toBe("COMPLETE");
    expect(result.analysisResult).toBeDefined();
    expect(result.analysisResult?.sentiment).toBe(testCase.expectedSentiment);
    expect(result.analysisResult?.violation_detected).toBe(
      testCase.expectedViolationDetected,
    );
    expect(result.analysisResult?.recommendation.action).toBe(
      testCase.expectedRecommendation,
    );
    expect(result.analysisResult?.public_response.text).toBeTruthy();

    if (testCase.expectedViolationDetected) {
      expect(result.analysisResult?.appeal).toBeDefined();
      expect(
        result.analysisResult?.appeal?.legal_grounds.length,
      ).toBeGreaterThan(0);
    } else {
      expect(result.analysisResult?.appeal).toBeUndefined();
    }
  });
});
