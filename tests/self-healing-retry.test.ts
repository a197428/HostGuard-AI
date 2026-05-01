import { describe, expect, it, vi } from "vitest";
import {
  DeepSeekClient,
  type LLMCallOptions,
} from "../src/backend/infrastructure/deepseek";
import {
  createMockMonitorAgentService,
  type MonitorAgentConfig,
  type ReviewAnalysisContext,
} from "../src/backend/agents/monitor";
import { MockRedisRepository } from "../src/backend/infrastructure/redis";
import { TavilyClient } from "../src/backend/infrastructure/tavily";

function createMockFetch(responses: Array<string>): typeof fetch {
  let index = 0;

  return (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: responses[index++] ?? responses[responses.length - 1],
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    )) as typeof fetch;
}

describe("Self-healing retry", () => {
  it("retries once when the first AI response is invalid JSON", async () => {
    const config: MonitorAgentConfig = {
      propertyId: "property_retry_001",
      ownerId: "owner_retry_001",
      monitoringIntervalMinutes: 120,
    };

    const llm = new DeepSeekClient({
      apiKey: "test-key",
      baseUrl: "https://routerai.ru/api/v1",
      fetchImpl: createMockFetch([
        "not-json",
        JSON.stringify({
          review_id: "review_retry_001",
          platform: "avito",
          sentiment: "negative",
          violation_detected: true,
          stay_verification: {
            guest_stayed: true,
            evidence: "Mock retry case",
          },
          violations: [
            {
              type: "insult",
              description: "Оскорбление",
              rule_reference: "п. 4.1",
            },
          ],
          public_response: {
            text: "Спасибо за обратную связь.",
            tone: "сдержанный",
          },
          appeal: {
            text: "Просим рассмотреть отзыв как нарушающий правила площадки.",
            legal_grounds: [
              {
                source: "platform_rules",
                article: "п. 4.1",
                citation: "Запрещены оскорбления",
              },
            ],
            confidence: 0.8,
          },
          recommendation: {
            action: "review_carefully",
            reason: "Mock retry case",
          },
        }),
      ]),
    });

    // Mock Tavily to return a review so the pipeline processes it
    const mockTavily = {
      extractReviewsFromUrl: vi.fn().mockResolvedValue([
        {
          text: "Тестовый отзыв",
          platform: "avito" as const,
          platformReviewId: "retry_case_001",
          rating: 1,
          reviewDate: "2026-04-30T00:00:00Z",
          url: "https://avito.ru/test",
        },
      ]),
    } as unknown as TavilyClient;

    const service = createMockMonitorAgentService(config, {
      redis: new MockRedisRepository(),
      llm,
      tavily: mockTavily,
    });

    const context: ReviewAnalysisContext = {
      reviewText: "Тестовый отзыв",
      platform: "avito",
      platformReviewId: "retry_case_001",
      rating: 1,
      reviewDate: "2026-04-30T00:00:00Z",
      propertyUrl: "https://avito.ru/test",
    };

    const result = await service.execute(context);

    expect(result.currentStep).toBe("COMPLETE");
    expect(result.error).toBeUndefined();
    expect(result.analysisResult?.sentiment).toBe("negative");
    expect(result.analysisResult?.appeal?.legal_grounds.length).toBeGreaterThan(
      0,
    );
  });
});
