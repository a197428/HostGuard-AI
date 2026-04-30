import { PROMPTS } from "@hostguard/shared/prompts";
import {
  AppealAgentResponseSchema,
  safeValidateSchema,
  type AppealAgentResponse,
  type Platform,
} from "@hostguard/shared/schemas";

// =============================================================================
// Configuration
// =============================================================================

export interface LLMConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxRetries?: number;
  circuitBreakerThreshold?: number;
  fetchImpl?: typeof fetch;
}

export interface LLMCallOptions {
  promptId: string;
  promptVersion: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  reviewDate?: string;
}

export interface LLMCallResult {
  response: AppealAgentResponse;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  latencyMs: number;
  traceId: string;
  model: string;
}

export interface LLMClient {
  analyzeReview(
    reviewText: string,
    platform: Platform,
    rating: number,
    options: LLMCallOptions,
  ): Promise<LLMCallResult>;
}

// =============================================================================
// Error types
// =============================================================================

export class LLMValidationError extends Error {
  constructor(
    message: string,
    public readonly errors?: unknown,
    public readonly rawResponse?: string,
  ) {
    super(message);
    this.name = "LLMValidationError";
  }
}

export class LLMCircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly failureCount: number,
    public readonly threshold: number,
  ) {
    super(message);
    this.name = "LLMCircuitBreakerError";
  }
}

// =============================================================================
// Circuit breaker state
// =============================================================================

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuitBreakerStates = new Map<string, CircuitBreakerState>();

function getCircuitBreakerState(model: string): CircuitBreakerState {
  const existing = circuitBreakerStates.get(model);
  if (existing) {
    return existing;
  }

  const fresh: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
  };
  circuitBreakerStates.set(model, fresh);
  return fresh;
}

// =============================================================================
// DeepSeek client
// =============================================================================

export class DeepSeekClient implements LLMClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly circuitBreakerThreshold: number;
  private readonly fetchImpl: typeof fetch;
  private model: string;
  private readonly fallbackModel = "gpt-4o-mini";

  constructor(config: LLMConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://routerai.ru/api/v1";
    this.model = config.model ?? "deepseek-v3.2";
    this.maxRetries = config.maxRetries ?? 3;
    this.circuitBreakerThreshold = config.circuitBreakerThreshold ?? 10;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async analyzeReview(
    reviewText: string,
    platform: Platform,
    rating: number,
    options: LLMCallOptions,
  ): Promise<LLMCallResult> {
    const start = Date.now();
    const maskedText = PROMPTS.maskPII(reviewText);
    const userPrompt = PROMPTS.buildReviewAnalysisPrompt(
      maskedText,
      platform,
      rating,
      options.reviewDate,
    );

    const response = await this.executeWithRetry(userPrompt, options);

    return {
      response,
      usage: {
        inputTokens: this.estimateTokens(userPrompt),
        outputTokens: this.estimateTokens(JSON.stringify(response)),
      },
      latencyMs: Date.now() - start,
      traceId: `trace_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      model: this.model,
    };
  }

  private async executeWithRetry(
    userPrompt: string,
    options: LLMCallOptions,
    attempt = 1,
  ): Promise<AppealAgentResponse> {
    try {
      const rawResponse = await this.callLLM(userPrompt, options);
      const validation = safeValidateSchema(
        AppealAgentResponseSchema,
        rawResponse,
      );

      if (!validation.success) {
        return this.retryWithClarification(
          userPrompt,
          options,
          attempt,
          validation.error.message,
          typeof rawResponse === "string"
            ? rawResponse
            : JSON.stringify(rawResponse),
        );
      }

      this.recordSuccess();
      return validation.data;
    } catch (error) {
      if (error instanceof LLMValidationError) {
        return this.retryWithClarification(
          userPrompt,
          options,
          attempt,
          error.message,
          error.rawResponse ?? "",
        );
      }

      if (attempt >= this.maxRetries) {
        this.recordFailure();
        throw error;
      }

      await this.sleep(this.retryDelay(attempt));
      return this.executeWithRetry(userPrompt, options, attempt + 1);
    }
  }

  private async retryWithClarification(
    userPrompt: string,
    options: LLMCallOptions,
    attempt: number,
    errorMessage: string,
    rawResponse: string,
  ): Promise<AppealAgentResponse> {
    if (attempt >= this.maxRetries) {
      this.recordFailure();
      throw new LLMValidationError(
        "Max retries reached for JSON validation",
        errorMessage,
        rawResponse,
      );
    }

    const retryPrompt = PROMPTS.buildJsonRetryPrompt(errorMessage, userPrompt);
    await this.sleep(this.retryDelay(attempt));
    return this.executeWithRetry(retryPrompt, options, attempt + 1);
  }

  private async callLLM(
    userPrompt: string,
    options: LLMCallOptions,
  ): Promise<unknown> {
    this.checkCircuitBreaker();

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content: options.systemPrompt ?? PROMPTS.APPEAL_AGENT_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response from LLM");
    }

    try {
      return JSON.parse(content);
    } catch (error) {
      throw new LLMValidationError(
        "Invalid JSON in LLM response",
        error,
        content,
      );
    }
  }

  private checkCircuitBreaker(): void {
    const state = getCircuitBreakerState(this.model);
    if (!state.isOpen) {
      return;
    }

    const elapsed = Date.now() - state.lastFailure;
    if (elapsed < 60_000) {
      this.model = this.fallbackModel;
      return;
    }

    state.isOpen = false;
    state.failures = 0;
  }

  private recordFailure(): void {
    const state = getCircuitBreakerState(this.model);
    state.failures += 1;
    state.lastFailure = Date.now();

    if (state.failures >= this.circuitBreakerThreshold) {
      state.isOpen = true;
      this.model = this.fallbackModel;
    }
  }

  private recordSuccess(): void {
    const state = getCircuitBreakerState(this.model);
    state.failures = 0;
    state.isOpen = false;
  }

  private retryDelay(attempt: number): number {
    return Math.min(1000 * 2 ** (attempt - 1), 10_000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// =============================================================================
// Mock client for tests
// =============================================================================

export interface MockLLMResponse {
  sentiment: AppealAgentResponse["sentiment"];
  violation_detected: boolean;
  public_response: { text: string; tone: string };
  appeal?: {
    text: string;
    legal_grounds: Array<{
      source: "platform_rules" | "gk_rf" | "uk_rf";
      article: string;
      citation: string;
    }>;
    confidence: number;
  };
  recommendation: AppealAgentResponse["recommendation"];
  stay_verification?: AppealAgentResponse["stay_verification"];
  violations?: AppealAgentResponse["violations"];
}

export class MockDeepSeekClient implements LLMClient {
  private readonly responses = new Map<string, MockLLMResponse>();
  private validationFailuresRemaining = 0;

  setResponse(key: string, response: MockLLMResponse): void {
    this.responses.set(key, response);
  }

  setResponseForReview(reviewText: string, response: MockLLMResponse): void {
    this.setResponse(PROMPTS.maskPII(reviewText), response);
  }

  setValidationFailure(attempts: number): void {
    this.validationFailuresRemaining = attempts;
  }

  async analyzeReview(
    reviewText: string,
    platform: Platform,
    rating: number,
    options: LLMCallOptions,
  ): Promise<LLMCallResult> {
    const maskedText = PROMPTS.maskPII(reviewText);
    const response =
      this.responses.get(maskedText) ??
      this.defaultResponse(maskedText, platform, rating);

    if (this.validationFailuresRemaining > 0) {
      this.validationFailuresRemaining -= 1;
      throw new LLMValidationError(
        "Simulated validation failure",
        undefined,
        "not json",
      );
    }

    const baseResponse = {
      review_id: `review_${Date.now()}`,
      platform,
      sentiment: response.sentiment,
      stay_verification: response.stay_verification ?? {
        guest_stayed: true,
        evidence: "Mock: бронирование подтверждено",
      },
      violations:
        response.violations ??
        (response.violation_detected
          ? [
              {
                type: "insult",
                description: "Оскорбление",
                rule_reference: "п. 4.1",
              },
            ]
          : []),
      public_response: response.public_response,
      recommendation: response.recommendation,
    };

    const validatedResponse = response.violation_detected
      ? ({
          ...baseResponse,
          violation_detected: true as const,
          appeal: response.appeal ?? {
            text: "Mock appeal text",
            legal_grounds: [
              {
                source: "platform_rules" as const,
                article: "п. 4.1",
                citation: "Mock rule reference",
              },
            ],
            confidence: 0.9,
          },
        } satisfies AppealAgentResponse)
      : ({
          ...baseResponse,
          violation_detected: false as const,
          appeal: undefined,
        } satisfies AppealAgentResponse);

    return {
      response: validatedResponse,
      usage: {
        inputTokens: 500,
        outputTokens: 300,
      },
      latencyMs: 150,
      traceId: `mock_trace_${Date.now()}`,
      model: "mock-deepseek",
    };
  }

  private defaultResponse(
    reviewText: string,
    platform: Platform,
    rating: number,
  ): MockLLMResponse {
    const lower = reviewText.toLowerCase();
    const negativeSignals = [
      "мошенник",
      "обман",
      "ужас",
      "фигово",
      "плох",
      "мат",
    ];
    const hasNegativeLanguage = negativeSignals.some((signal) =>
      lower.includes(signal),
    );
    const sentiment =
      rating >= 4 && !hasNegativeLanguage
        ? "positive"
        : rating <= 2 || hasNegativeLanguage
          ? "negative"
          : "neutral";
    const violationDetected = ["мошенник", "мат", "дурак", "козёл"].some(
      (signal) => lower.includes(signal),
    );

    const baseResponse: MockLLMResponse = {
      sentiment,
      violation_detected: violationDetected,
      public_response: {
        text: "Спасибо за ваш отзыв. Мы обязательно учтём замечания.",
        tone: "сдержанный",
      },
      ...(violationDetected
        ? {
            appeal: {
              text: `Просим рассмотреть отзыв как нарушающий правила ${platform}.`,
              legal_grounds: [
                {
                  source: "platform_rules" as const,
                  article: "п. 4.1",
                  citation: "Запрещены оскорбления и уничижительная лексика",
                },
              ],
              confidence: 0.82,
            },
          }
        : {}),
      recommendation: {
        action: violationDetected
          ? "review_carefully"
          : sentiment === "positive"
            ? "approve"
            : "approve",
        reason: violationDetected
          ? "Найдено нарушение правил площадки"
          : "Нарушений не обнаружено",
      },
      stay_verification: {
        guest_stayed: true,
        evidence: "Mock: бронирование подтверждено",
      },
      violations: violationDetected
        ? [
            {
              type: "insult",
              description: "Mock violation",
              rule_reference: "п. 4.1",
            },
          ]
        : [],
    };

    return baseResponse;
  }
}
