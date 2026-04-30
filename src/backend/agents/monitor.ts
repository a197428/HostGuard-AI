import type { AppealAgentResponse, Platform } from "@hostguard/shared/schemas";
import { PROMPTS } from "@hostguard/shared/prompts";
import {
  createSupabaseClient,
  SupabaseRepository,
} from "../infrastructure/supabase";
import {
  RedisRepository,
  type IRedisRepository,
  MockRedisRepository,
} from "../infrastructure/redis";
import {
  DeepSeekClient,
  MockDeepSeekClient,
  type LLMClient,
  type LLMCallResult,
} from "../infrastructure/deepseek";
import { logStructured } from "../infrastructure/logging";
import type { Env } from "../env";

// =============================================================================
// Types
// =============================================================================

export interface MonitorAgentConfig {
  propertyId: string;
  ownerId: string;
  monitoringIntervalMinutes: number;
}

export interface ReviewAnalysisContext {
  reviewText: string;
  platform: Platform;
  platformReviewId: string;
  rating: number;
  reviewDate?: string;
}

export type ThinkActStep =
  | "TRIGGER"
  | "RETRIEVE"
  | "ANALYZE"
  | "DRAFT"
  | "NOTIFY"
  | "STORE"
  | "COMPLETE";

export interface ThinkActState {
  currentStep: ThinkActStep;
  reviewId?: string;
  analysisResult?: AppealAgentResponse;
  llmCallResult?: LLMCallResult;
  error?: string;
  retryCount: number;
}

export interface MonitorAgentExecutionInput {
  config: MonitorAgentConfig;
  context: ReviewAnalysisContext;
}

export interface MonitorAgentDependencies {
  redis: IRedisRepository;
  supabase: SupabaseRepository;
  llm: LLMClient;
}

// =============================================================================
// ThinkActLoop errors
// =============================================================================

export class ThinkActLoopError extends Error {
  constructor(
    message: string,
    public readonly step: ThinkActStep,
    public readonly reviewId?: string,
  ) {
    super(message);
    this.name = "ThinkActLoopError";
  }
}

export class DeduplicationError extends ThinkActLoopError {
  constructor(platform: Platform, platformReviewId: string) {
    super(
      `Review ${platform}:${platformReviewId} already processed`,
      "TRIGGER",
      platformReviewId,
    );
  }
}

// =============================================================================
// Dependency factories
// =============================================================================

export function createMonitorAgentDependencies(
  env: Env,
): MonitorAgentDependencies {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseServiceKey = env.SUPABASE_SERVICE_KEY;
  const routerAiKey = env.ROUTERAI_API_KEY ?? env.OPENROUTER_API_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase credentials are required for MonitorAgent");
  }

  if (!routerAiKey) {
    throw new Error("RouterAI/OpenRouter API key is required for MonitorAgent");
  }

  const supabase = new SupabaseRepository(
    createSupabaseClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    }),
  );

  const redis =
    env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN
      ? new RedisRepository({
          url: env.UPSTASH_REDIS_URL,
          token: env.UPSTASH_REDIS_TOKEN,
        })
      : new MockRedisRepository();

  const llm = new DeepSeekClient({
    apiKey: routerAiKey,
    baseUrl: env.ROUTERAI_BASE_URL ?? "https://routerai.ru/api/v1",
    model: env.DEEPSEEK_MODEL ?? "deepseek-v3.2",
    maxRetries: 3,
    circuitBreakerThreshold: 10,
  });

  return { redis, supabase, llm };
}

function createTraceId(): string {
  return `monitor_${Date.now()}_${crypto.randomUUID().slice(0, 12)}`;
}

// =============================================================================
// MonitorAgent service
// =============================================================================

export class MonitorAgentService {
  private state: ThinkActState;

  constructor(
    private readonly config: MonitorAgentConfig,
    private readonly deps: MonitorAgentDependencies,
    initialState?: Partial<ThinkActState>,
  ) {
    this.state = {
      currentStep: "TRIGGER",
      retryCount: 0,
      ...initialState,
    };
  }

  getState(): ThinkActState {
    return this.state;
  }

  async execute(context: ReviewAnalysisContext): Promise<ThinkActState> {
    const traceId = createTraceId();
    logStructured("info", {
      trace_id: traceId,
      owner_id: this.config.ownerId,
      property_id: this.config.propertyId,
      message: "Starting ThinkActLoop",
      data: {
        step: this.state.currentStep,
        platform: context.platform,
        platform_review_id: context.platformReviewId,
      },
    });

    try {
      await this.trigger(traceId, context);
      this.state.currentStep = "RETRIEVE";

      await this.retrieve(traceId, context);
      this.state.currentStep = "ANALYZE";

      await this.analyze(traceId, context);
      this.state.currentStep = "DRAFT";

      await this.draft(traceId, context);
      this.state.currentStep = "NOTIFY";

      await this.notify(traceId, context);
      this.state.currentStep = "STORE";

      await this.store(traceId, context);
      this.state.currentStep = "COMPLETE";

      logStructured("info", {
        trace_id: traceId,
        owner_id: this.config.ownerId,
        property_id: this.config.propertyId,
        message: "ThinkActLoop completed successfully",
        data: {
          step: this.state.currentStep,
          review_id: this.state.reviewId,
        },
      });

      return this.state;
    } catch (error) {
      return this.handleError(traceId, error);
    }
  }

  private async trigger(
    traceId: string,
    context: ReviewAnalysisContext,
  ): Promise<void> {
    const isProcessed = await this.deps.redis.isReviewProcessed(
      context.platform,
      context.platformReviewId,
    );

    if (isProcessed) {
      throw new DeduplicationError(context.platform, context.platformReviewId);
    }

    logStructured("info", {
      trace_id: traceId,
      owner_id: this.config.ownerId,
      property_id: this.config.propertyId,
      message: "Review passed deduplication check",
      data: {
        platform: context.platform,
        platform_review_id: context.platformReviewId,
      },
    });
  }

  private async retrieve(
    traceId: string,
    context: ReviewAnalysisContext,
  ): Promise<void> {
    const property = await this.deps.supabase.getProperty(
      this.config.propertyId,
    );
    if (!property) {
      throw new ThinkActLoopError(
        `Property ${this.config.propertyId} not found`,
        "RETRIEVE",
      );
    }

    const owner = await this.deps.supabase.getOwner(this.config.ownerId);
    const propertyMemory = await this.deps.supabase.getAgentMemory(
      "local",
      this.config.propertyId,
    );

    logStructured("info", {
      trace_id: traceId,
      owner_id: this.config.ownerId,
      property_id: this.config.propertyId,
      message: "Retrieved property and memory context",
      data: {
        property_name: property.name,
        owner_tone_of_voice: owner?.tone_of_voice ?? null,
        has_memory: propertyMemory.length > 0,
        platform: context.platform,
      },
    });
  }

  private async analyze(
    traceId: string,
    context: ReviewAnalysisContext,
  ): Promise<void> {
    const result = await this.deps.llm.analyzeReview(
      context.reviewText,
      context.platform,
      context.rating,
      {
        promptId: "appeal-agent",
        promptVersion: PROMPTS.VERSIONS.APPEAL_AGENT.version,
        reviewDate: context.reviewDate,
      },
    );

    this.state.llmCallResult = result;
    this.state.analysisResult = result.response;

    logStructured("info", {
      trace_id: traceId,
      owner_id: this.config.ownerId,
      property_id: this.config.propertyId,
      message: "AI analysis complete",
      data: {
        sentiment: result.response.sentiment,
        violation_detected: result.response.violation_detected,
        latency_ms: result.latencyMs,
      },
    });
  }

  private async draft(
    traceId: string,
    _context: ReviewAnalysisContext,
  ): Promise<void> {
    const analysis = this.state.analysisResult;
    if (!analysis) {
      throw new ThinkActLoopError("No analysis result to draft", "DRAFT");
    }

    logStructured("info", {
      trace_id: traceId,
      owner_id: this.config.ownerId,
      property_id: this.config.propertyId,
      message: "Draft prepared for human review",
      data: {
        has_public_response: Boolean(analysis.public_response?.text),
        has_appeal: Boolean(analysis.appeal),
        confidence: analysis.appeal?.confidence ?? null,
      },
    });
  }

  private async notify(
    traceId: string,
    _context: ReviewAnalysisContext,
  ): Promise<void> {
    const analysis = this.state.analysisResult;
    if (!analysis) {
      throw new ThinkActLoopError("No analysis result to notify", "NOTIFY");
    }

    logStructured("info", {
      trace_id: traceId,
      owner_id: this.config.ownerId,
      property_id: this.config.propertyId,
      message: "Notification prepared for Telegram",
      data: {
        recommendation: analysis.recommendation.action,
      },
    });
  }

  private async store(
    traceId: string,
    context: ReviewAnalysisContext,
  ): Promise<void> {
    const analysis = this.state.analysisResult;
    if (!analysis) {
      throw new ThinkActLoopError("No analysis result to store", "STORE");
    }

    const review = await this.deps.supabase.createReview({
      property_id: this.config.propertyId,
      owner_id: this.config.ownerId,
      platform: context.platform,
      platform_review_id: context.platformReviewId,
      rating: context.rating,
      text: context.reviewText,
      review_date: context.reviewDate,
      sentiment: analysis.sentiment,
      violation_detected: analysis.violation_detected,
      violations: analysis.violations,
      public_response: analysis.public_response.text,
      appeal_text: analysis.appeal?.text,
      appeal_confidence: analysis.appeal?.confidence,
      legal_grounds: analysis.appeal?.legal_grounds,
      status: "draft_ready",
    });

    this.state.reviewId = review.id;

    if (this.state.llmCallResult) {
      await this.deps.supabase.createLLmCall({
        owner_id: this.config.ownerId,
        review_id: review.id,
        model:
          this.state.llmCallResult.model === "gpt-4o-mini"
            ? "gpt-4o-mini"
            : "deepseek",
        prompt_id: "appeal-agent",
        prompt_version: PROMPTS.VERSIONS.APPEAL_AGENT.version,
        input_tokens: this.state.llmCallResult.usage.inputTokens,
        output_tokens: this.state.llmCallResult.usage.outputTokens,
        latency_ms: this.state.llmCallResult.latencyMs,
        trace_id: this.state.llmCallResult.traceId,
        response_status: "success",
      });
    }

    await this.deps.redis.markReviewProcessed(
      context.platform,
      context.platformReviewId,
    );

    logStructured("info", {
      trace_id: traceId,
      owner_id: this.config.ownerId,
      property_id: this.config.propertyId,
      message: "Results stored to Supabase and Redis",
      data: {
        review_id: review.id,
      },
    });
  }

  private handleError(traceId: string, error: unknown): ThinkActState {
    const nextState: ThinkActState = {
      ...this.state,
      retryCount: this.state.retryCount + 1,
      error: error instanceof Error ? error.message : "Unknown error",
    };
    this.state = nextState;

    logStructured("error", {
      trace_id: traceId,
      owner_id: this.config.ownerId,
      property_id: this.config.propertyId,
      message: "ThinkActLoop error",
      data: {
        step: this.state.currentStep,
        error: this.state.error,
        retry_count: this.state.retryCount,
      },
    });

    return this.state;
  }
}

// =============================================================================
// Cloudflare Agents SDK Durable Object
// =============================================================================

export function createMockMonitorAgentService(
  config: MonitorAgentConfig,
  overrides?: Partial<MonitorAgentDependencies>,
): MonitorAgentService {
  const mockSupabase: SupabaseRepository = {
    getProperty: async () => ({
      id: config.propertyId,
      owner_id: config.ownerId,
      name: "Mock Property",
      created_at: "2026-04-30T00:00:00Z",
      updated_at: "2026-04-30T00:00:00Z",
      monitoring_interval: config.monitoringIntervalMinutes,
      is_monitoring_active: true,
      is_deleted: false,
    }),
    getOwner: async () => ({
      id: config.ownerId,
      email: "owner@example.com",
      created_at: "2026-04-30T00:00:00Z",
      updated_at: "2026-04-30T00:00:00Z",
      is_deleted: false,
      tone_of_voice: "official",
    }),
    getAgentMemory: async () => [],
    createReview: async (
      review: Parameters<SupabaseRepository["createReview"]>[0],
    ) => ({
      id: `review_${Date.now()}`,
      created_at: "2026-04-30T00:00:00Z",
      updated_at: "2026-04-30T00:00:00Z",
      ...review,
      is_deleted: false,
    }),
    createLLmCall: async (
      call: Parameters<SupabaseRepository["createLLmCall"]>[0],
    ) => ({
      id: `llm_${Date.now()}`,
      created_at: "2026-04-30T00:00:00Z",
      ...call,
    }),
  } as unknown as SupabaseRepository;

  const dependencies: MonitorAgentDependencies = {
    redis: overrides?.redis ?? new MockRedisRepository(),
    supabase: overrides?.supabase ?? mockSupabase,
    llm: overrides?.llm ?? new MockDeepSeekClient(),
  };

  return new MonitorAgentService(config, dependencies);
}
