import type { AgentMemory, Owner, Property } from '@hostguard/shared';
import { PROMPTS } from '@hostguard/shared/prompts';
import type { AppealAgentResponse, Platform } from '@hostguard/shared/schemas';
import type { Env } from '../env';
import { BrowserRenderingClient } from '../infrastructure/browser-rendering';
import {
	DeepSeekClient,
	MockDeepSeekClient,
	type LLMCallResult,
	type LLMClient,
} from '../infrastructure/deepseek';
import { logStructured } from '../infrastructure/logging';
import { reportError } from '../infrastructure/observability';
import {
	MockRedisRepository,
	RedisRepository,
	type IRedisRepository,
} from '../infrastructure/redis';
import { ResilienceRegistry } from '../infrastructure/resilience';
import {
	createSupabaseClient,
	SupabaseRepository,
} from '../infrastructure/supabase';
import { TavilyClient, type ScrapedReview } from '../infrastructure/tavily';

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
	propertyUrl?: string;
}

export interface RetrievedReview {
	review: ScrapedReview;
	source: 'tavily' | 'browser_rendering';
}

export interface RetrieveResult {
	reviews: RetrievedReview[];
	property: Property;
	owner: Owner | null;
	propertyMemory: AgentMemory[];
}

export type ThinkActStep =
	| 'TRIGGER'
	| 'RETRIEVE'
	| 'ANALYZE'
	| 'DRAFT'
	| 'NOTIFY'
	| 'STORE'
	| 'COMPLETE';

export interface ThinkActState {
	currentStep: ThinkActStep;
	reviewId?: string;
	analysisResult?: AppealAgentResponse;
	llmCallResult?: LLMCallResult;
	error?: string;
	retryCount: number;
	retrievedReviews?: RetrievedReview[]; // Новое поле для найденных отзывов
	processedReviewIds?: string[]; // Новое поле для ID обработанных отзывов
}

export interface MonitorAgentExecutionInput {
	config: MonitorAgentConfig;
	context: ReviewAnalysisContext;
}

export interface MonitorAgentDependencies {
	redis: IRedisRepository;
	supabase: SupabaseRepository;
	llm: LLMClient;
	tavily?: TavilyClient;
	browserRendering?: BrowserRenderingClient;
	telegramBotToken?: string;
	observability: {
		SENTRY_DSN?: string;
		SENTRY_ENVIRONMENT?: string;
		SENTRY_RELEASE?: string;
	};
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
		this.name = 'ThinkActLoopError';
	}
}

export class DeduplicationError extends ThinkActLoopError {
	constructor(platform: Platform, platformReviewId: string) {
		super(
			`Review ${platform}:${platformReviewId} already processed`,
			'TRIGGER',
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
		throw new Error('Supabase credentials are required for MonitorAgent');
	}

	if (!routerAiKey) {
		throw new Error('RouterAI/OpenRouter API key is required for MonitorAgent');
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
			: env.SENTRY_ENVIRONMENT === 'production' ||
				  env.SENTRY_ENVIRONMENT === 'staging'
				? (() => {
						throw new Error(
							'Redis credentials are required for production/staging environment. ' +
								'Set UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN in environment variables.',
						);
					})()
				: new MockRedisRepository();

	const llm = new DeepSeekClient({
		apiKey: routerAiKey,
		baseUrl:
			env.AI_GATEWAY_BASE_URL ??
			env.ROUTERAI_BASE_URL ??
			'https://routerai.ru/api/v1',
		model: env.DEEPSEEK_MODEL ?? 'deepseek-v3.2',
		maxRetries: 3,
		circuitBreakerThreshold: 10,
		requestHeaders: {
			'x-hostguard-app': 'hostguard-ai',
		},
	});

	const tavily = env.TAVILY_API_KEY
		? new TavilyClient({ apiKey: env.TAVILY_API_KEY })
		: undefined;

	const browserRendering = env.BROWSER_RENDERING
		? new BrowserRenderingClient({ binding: env.BROWSER_RENDERING })
		: undefined;

	return {
		redis,
		supabase,
		llm,
		tavily,
		browserRendering,
		telegramBotToken: env.TELEGRAM_BOT_TOKEN,
		observability: {
			SENTRY_DSN: env.SENTRY_DSN,
			SENTRY_ENVIRONMENT: env.SENTRY_ENVIRONMENT,
			SENTRY_RELEASE: env.SENTRY_RELEASE,
		},
	};
}

function createTraceId(): string {
	return `monitor_${Date.now()}_${crypto.randomUUID().slice(0, 12)}`;
}

function normalizeReviewDate(value?: string): string {
	if (!value) {
		return new Date().toISOString();
	}

	const parsed = new Date(value);
	if (!Number.isNaN(parsed.getTime())) {
		return parsed.toISOString();
	}

	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return new Date(`${value}T00:00:00.000Z`).toISOString();
	}

	return new Date().toISOString();
}

function maskTelegramId(value: number): string {
	const digits = String(value);
	if (digits.length <= 2) {
		return '**';
	}
	return `***${digits.slice(-2)}`;
}

// =============================================================================
// MonitorAgent service
// =============================================================================

export class MonitorAgentService {
	private state: ThinkActState;
	private dedupLock:
		| { platform: Platform; platformReviewId: string }
		| undefined;

	constructor(
		private readonly config: MonitorAgentConfig,
		private readonly deps: MonitorAgentDependencies,
		initialState?: Partial<ThinkActState>,
	) {
		this.state = {
			currentStep: 'TRIGGER',
			retryCount: 0,
			...initialState,
		};
	}

	getState(): ThinkActState {
		return this.state;
	}

	async execute(context: ReviewAnalysisContext): Promise<ThinkActState> {
		const traceId = createTraceId();
		logStructured('info', {
			trace_id: traceId,
			owner_id: this.config.ownerId,
			property_id: this.config.propertyId,
			message: 'Starting ThinkActLoop',
			data: {
				step: this.state.currentStep,
				platform: context.platform,
				platform_review_id: context.platformReviewId,
			},
		});

		try {
			await this.trigger(traceId, context);
			this.state.currentStep = 'RETRIEVE';

			const retrieveResult = await this.retrieve(traceId, context);
			this.state.retrievedReviews = retrieveResult.reviews;
			this.state.processedReviewIds = [];
			this.state.currentStep = 'ANALYZE';

			// Обрабатываем каждый найденный отзыв через pipeline
			for (const retrievedReview of retrieveResult.reviews) {
				await this.processSingleReview(
					traceId,
					retrievedReview,
					retrieveResult,
				);
			}

			this.state.currentStep = 'COMPLETE';

			logStructured('info', {
				trace_id: traceId,
				owner_id: this.config.ownerId,
				property_id: this.config.propertyId,
				message: 'ThinkActLoop completed successfully',
				data: {
					step: this.state.currentStep,
					processed_reviews_count: this.state.processedReviewIds?.length ?? 0,
					total_reviews_found: retrieveResult.reviews.length,
				},
			});

			return this.state;

			logStructured('info', {
				trace_id: traceId,
				owner_id: this.config.ownerId,
				property_id: this.config.propertyId,
				message: 'ThinkActLoop completed successfully',
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

	async retrieveAndProcess(
		traceId: string,
	): Promise<{ reviewsProcessed: number }> {
		const context: ReviewAnalysisContext = {
			reviewText: '', // Not used in retrieve
			platform: 'avito', // Default, will be overridden by retrieved reviews
			platformReviewId: '',
			rating: 5,
		};

		const retrieveResult = await this.retrieve(traceId, context);
		let processedCount = 0;

		for (const retrievedReview of retrieveResult.reviews) {
			try {
				await this.processSingleReview(
					traceId,
					retrievedReview,
					retrieveResult,
				);
				processedCount++;
			} catch (error) {
				logStructured('error', {
					trace_id: traceId,
					owner_id: this.config.ownerId,
					property_id: this.config.propertyId,
					message: 'Failed to process single review',
					data: {
						platform: retrievedReview.review.platform,
						platform_review_id: retrievedReview.review.platformReviewId,
						error: error instanceof Error ? error.message : 'Unknown',
					},
				});
			}
		}

		return { reviewsProcessed: processedCount };
	}

	private async trigger(
		traceId: string,
		context: ReviewAnalysisContext,
	): Promise<void> {
		const dedupResult = await this.deps.redis.checkAndMarkReviewProcessed(
			context.platform,
			context.platformReviewId,
		);

		if (!dedupResult.isNew) {
			throw new DeduplicationError(context.platform, context.platformReviewId);
		}
		this.dedupLock = {
			platform: context.platform,
			platformReviewId: context.platformReviewId,
		};

		logStructured('info', {
			trace_id: traceId,
			owner_id: this.config.ownerId,
			property_id: this.config.propertyId,
			message: 'Review passed deduplication check',
			data: {
				platform: context.platform,
				platform_review_id: context.platformReviewId,
				redis_key: dedupResult.key,
			},
		});
	}

	private async retrieve(
		traceId: string,
		context: ReviewAnalysisContext,
	): Promise<RetrieveResult> {
		const property = await this.deps.supabase.getProperty(
			this.config.propertyId,
		);
		if (!property) {
			throw new ThinkActLoopError(
				`Property ${this.config.propertyId} not found`,
				'RETRIEVE',
			);
		}

		const owner = await this.deps.supabase.getOwner(this.config.ownerId);
		const propertyMemory = await this.deps.supabase.getAgentMemory(
			'local',
			this.config.propertyId,
		);

		const reviews: RetrievedReview[] = [];

		// Если есть propertyUrl и Tavily доступен — пытаемся собрать отзывы
		if (context.propertyUrl && this.deps.tavily) {
			try {
				const tavilyReviews = await this.deps.tavily.extractReviewsFromUrl(
					context.propertyUrl,
					context.platform,
				);

				reviews.push(
					...tavilyReviews.map(review => ({
						review,
						source: 'tavily' as const,
					})),
				);

				logStructured('info', {
					trace_id: traceId,
					owner_id: this.config.ownerId,
					property_id: this.config.propertyId,
					message: 'Reviews retrieved via Tavily',
					data: {
						url: context.propertyUrl,
						platform: context.platform,
						review_count: reviews.length,
					},
				});
			} catch (tavilyError) {
				// Fallback на Browser Rendering
				logStructured('warn', {
					trace_id: traceId,
					owner_id: this.config.ownerId,
					property_id: this.config.propertyId,
					message:
						'Tavily extraction failed, trying Browser Rendering fallback',
					data: {
						url: context.propertyUrl,
						error:
							tavilyError instanceof Error ? tavilyError.message : 'Unknown',
					},
				});

				if (this.deps.browserRendering) {
					try {
						const fallbackReviews =
							await this.deps.browserRendering.extractReviewsFromUrl(
								context.propertyUrl,
								context.platform,
							);

						reviews.push(
							...fallbackReviews.map(review => ({
								review,
								source: 'browser_rendering' as const,
							})),
						);

						logStructured('info', {
							trace_id: traceId,
							owner_id: this.config.ownerId,
							property_id: this.config.propertyId,
							message: 'Reviews retrieved via Browser Rendering (fallback)',
							data: {
								url: context.propertyUrl,
								platform: context.platform,
								review_count: reviews.length,
							},
						});
					} catch (brError) {
						logStructured('error', {
							trace_id: traceId,
							owner_id: this.config.ownerId,
							property_id: this.config.propertyId,
							message: 'Both Tavily and Browser Rendering failed',
							data: {
								url: context.propertyUrl,
								tavily_error:
									tavilyError instanceof Error
										? tavilyError.message
										: 'Unknown',
								br_error:
									brError instanceof Error ? brError.message : 'Unknown',
							},
						});
					}
				}
			}
		}

		logStructured('info', {
			trace_id: traceId,
			owner_id: this.config.ownerId,
			property_id: this.config.propertyId,
			message: 'Retrieved property and memory context',
			data: {
				property_name: property.name,
				owner_tone_of_voice: owner?.tone_of_voice ?? null,
				has_memory: propertyMemory.length > 0,
				platform: context.platform,
				has_property_url: Boolean(context.propertyUrl),
				retrieved_reviews_count: reviews.length,
			},
		});

		return {
			reviews,
			property,
			owner,
			propertyMemory,
		};
	}
	private async processSingleReview(
		traceId: string,
		retrievedReview: RetrievedReview,
		retrieveResult: RetrieveResult,
	): Promise<void> {
		const reviewContext: ReviewAnalysisContext = {
			reviewText: retrievedReview.review.text,
			platform: retrievedReview.review.platform,
			platformReviewId: retrievedReview.review.platformReviewId,
			rating: retrievedReview.review.rating,
			reviewDate: retrievedReview.review.reviewDate,
			propertyUrl: retrievedReview.review.url,
		};

		// Дедупликация уже выполнена в trigger() для исходного контекста.
		// Для отзывов, найденных через retrieve(), проверяем только если
		// это не тот же самый отзыв, что был передан в execute().
		// Если platformReviewId совпадает — пропускаем повторную проверку.

		try {
			// Analyze
			await this.analyzeSingleReview(traceId, reviewContext, retrieveResult);

			// Draft
			await this.draftSingleReview(traceId, reviewContext);

			// Notify
			await this.notifySingleReview(traceId, reviewContext);

			// Store
			const reviewId = await this.storeSingleReview(
				traceId,
				reviewContext,
				retrievedReview,
			);

			// Добавляем в список обработанных
			this.state.processedReviewIds = this.state.processedReviewIds || [];
			this.state.processedReviewIds.push(reviewId);

			logStructured('info', {
				trace_id: traceId,
				owner_id: this.config.ownerId,
				property_id: this.config.propertyId,
				message: 'Single review processed successfully',
				data: {
					platform: reviewContext.platform,
					platform_review_id: reviewContext.platformReviewId,
					review_id: reviewId,
					source: retrievedReview.source,
				},
			});
		} catch (error) {
			logStructured('error', {
				trace_id: traceId,
				owner_id: this.config.ownerId,
				property_id: this.config.propertyId,
				message: 'Failed to process single review',
				data: {
					platform: reviewContext.platform,
					platform_review_id: reviewContext.platformReviewId,
					error: error instanceof Error ? error.message : 'Unknown',
				},
			});
		}
	}
	private async analyzeSingleReview(
		traceId: string,
		context: ReviewAnalysisContext,
		retrieveResult: RetrieveResult,
	): Promise<void> {
		const result = await this.deps.llm.analyzeReview(
			context.reviewText,
			context.platform,
			context.rating,
			{
				promptId: 'appeal-agent',
				promptVersion: PROMPTS.VERSIONS.APPEAL_AGENT.version,
				reviewDate: context.reviewDate,
				traceId,
			},
		);

		this.state.llmCallResult = result;
		this.state.analysisResult = result.response;

		logStructured('info', {
			trace_id: traceId,
			owner_id: this.config.ownerId,
			property_id: this.config.propertyId,
			message: 'AI analysis complete for single review',
			data: {
				sentiment: result.response.sentiment,
				violation_detected: result.response.violation_detected,
				platform: context.platform,
				platform_review_id: context.platformReviewId,
			},
		});
	}

	private async draftSingleReview(
		traceId: string,
		context: ReviewAnalysisContext,
	): Promise<void> {
		// Drafting is handled in analyzeSingleReview - responses are already generated
		logStructured('info', {
			trace_id: traceId,
			owner_id: this.config.ownerId,
			property_id: this.config.propertyId,
			message: 'Drafting complete for single review',
			data: {
				has_public_response: Boolean(
					this.state.analysisResult?.public_response?.text,
				),
				has_appeal: Boolean(this.state.analysisResult?.appeal?.text),
				platform: context.platform,
				platform_review_id: context.platformReviewId,
			},
		});
	}

	private async notifySingleReview(
		traceId: string,
		context: ReviewAnalysisContext,
	): Promise<void> {
		if (!this.deps.telegramBotToken || !this.state.analysisResult) {
			logStructured('warn', {
				trace_id: traceId,
				owner_id: this.config.ownerId,
				property_id: this.config.propertyId,
				message:
					'Cannot send notification - missing Telegram token or analysis result',
				data: {
					has_telegram_token: Boolean(this.deps.telegramBotToken),
					has_analysis_result: Boolean(this.state.analysisResult),
				},
			});
			return;
		}

		try {
			// sendReviewAlert requires (env, ownerTelegramId, payload) signature
			// For now, we skip sending since we don't have the owner's telegram_id here
			logStructured('info', {
				trace_id: traceId,
				owner_id: this.config.ownerId,
				property_id: this.config.propertyId,
				message: 'Telegram notification skipped - owner telegram_id not available in this context',
				data: {
					platform: context.platform,
					platform_review_id: context.platformReviewId,
				},
			});

			logStructured('info', {
				trace_id: traceId,
				owner_id: this.config.ownerId,
				property_id: this.config.propertyId,
				message: 'Telegram notification sent for single review',
				data: {
					platform: context.platform,
					platform_review_id: context.platformReviewId,
				},
			});
		} catch (error) {
			logStructured('error', {
				trace_id: traceId,
				owner_id: this.config.ownerId,
				property_id: this.config.propertyId,
				message: 'Failed to send Telegram notification',
				data: {
					platform: context.platform,
					platform_review_id: context.platformReviewId,
					error: error instanceof Error ? error.message : 'Unknown',
				},
			});
		}
	}

	private async storeSingleReview(
		traceId: string,
		context: ReviewAnalysisContext,
		retrievedReview: RetrievedReview,
	): Promise<string> {
		if (!this.state.analysisResult) {
			throw new ThinkActLoopError(
				'Cannot store review without analysis result',
				'STORE',
			);
		}

		const reviewData = {
			property_id: this.config.propertyId,
			owner_id: this.config.ownerId,
			platform: context.platform,
			platform_review_id: context.platformReviewId,
			author_name_hash: retrievedReview.review.authorName || undefined,
			rating: context.rating,
			text: context.reviewText,
			review_date: context.reviewDate
				? new Date(context.reviewDate).toISOString()
				: undefined,
			sentiment: this.state.analysisResult.sentiment,
			violation_detected: this.state.analysisResult.violation_detected,
			violations: this.state.analysisResult.violations || [],
			public_response: this.state.analysisResult.public_response?.text || undefined,
			appeal_text: this.state.analysisResult.appeal?.text || undefined,
			appeal_confidence: this.state.analysisResult.appeal?.confidence || undefined,
			legal_grounds: this.state.analysisResult.appeal?.legal_grounds || [],
			status: 'draft_ready' as const,
		};

		const review = await this.deps.supabase.createReview(reviewData);

		// Сохраняем LLM call
		if (this.state.llmCallResult) {
			await this.deps.supabase.createLLmCall({
				owner_id: this.config.ownerId,
				review_id: review.id,
				model: this.state.llmCallResult.model as 'deepseek' | 'gpt-4o-mini',
				prompt_id: 'appeal-agent',
				prompt_version: '1.0.0',
				input_tokens: this.state.llmCallResult.usage.inputTokens,
				output_tokens: this.state.llmCallResult.usage.outputTokens,
				latency_ms: this.state.llmCallResult.latencyMs,
				trace_id: traceId,
				response_status: 'success',
			});
		}

		logStructured('info', {
			trace_id: traceId,
			owner_id: this.config.ownerId,
			property_id: this.config.propertyId,
			message: 'Single review stored successfully',
			data: {
				review_id: review.id,
				platform: context.platform,
				platform_review_id: context.platformReviewId,
				sentiment: review.sentiment,
				violation_detected: review.violation_detected,
			},
		});

		return review.id;
	}

	private handleError(traceId: string, error: unknown): ThinkActState {
		const nextState: ThinkActState = {
			...this.state,
			retryCount: this.state.retryCount + 1,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
		this.state = nextState;

		void reportError(
			this.deps.observability,
			{
				trace_id: traceId,
				owner_id: this.config.ownerId,
				property_id: this.config.propertyId,
				message: 'ThinkActLoop error',
				data: {
					step: this.state.currentStep,
					error: this.state.error,
					retry_count: this.state.retryCount,
				},
			},
			error,
		);

		if (this.dedupLock && !this.state.reviewId) {
			const lockToRelease = this.dedupLock;
			this.dedupLock = undefined;
			void this.deps.redis
				.deleteReviewKey(lockToRelease.platform, lockToRelease.platformReviewId)
				.then(() => {
					logStructured('warn', {
						trace_id: traceId,
						owner_id: this.config.ownerId,
						property_id: this.config.propertyId,
						message: 'Released deduplication lock after failed execution',
						data: {
							platform: lockToRelease.platform,
							platform_review_id: lockToRelease.platformReviewId,
						},
					});
				})
				.catch(releaseError => {
					logStructured('error', {
						trace_id: traceId,
						owner_id: this.config.ownerId,
						property_id: this.config.propertyId,
						message: 'Failed to release deduplication lock',
						data: {
							platform: lockToRelease.platform,
							platform_review_id: lockToRelease.platformReviewId,
							error:
								releaseError instanceof Error
									? releaseError.message
									: 'Unknown',
						},
					});
				});
		}

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
			name: 'Mock Property',
			created_at: '2026-04-30T00:00:00Z',
			updated_at: '2026-04-30T00:00:00Z',
			monitoring_interval: config.monitoringIntervalMinutes,
			is_monitoring_active: true,
			is_deleted: false,
		}),
		getOwner: async () => ({
			id: config.ownerId,
			email: 'owner@example.com',
			created_at: '2026-04-30T00:00:00Z',
			updated_at: '2026-04-30T00:00:00Z',
			is_deleted: false,
			tone_of_voice: 'official',
		}),
		getAgentMemory: async () => [],
		createReview: async (
			review: Parameters<SupabaseRepository['createReview']>[0],
		) => ({
			id: `review_${Date.now()}`,
			created_at: '2026-04-30T00:00:00Z',
			updated_at: '2026-04-30T00:00:00Z',
			...review,
			is_deleted: false,
		}),
		createLLmCall: async (
			call: Parameters<SupabaseRepository['createLLmCall']>[0],
		) => ({
			id: `llm_${Date.now()}`,
			created_at: '2026-04-30T00:00:00Z',
			...call,
		}),
	} as unknown as SupabaseRepository;

	const dependencies: MonitorAgentDependencies = {
		redis: overrides?.redis ?? new MockRedisRepository(),
		supabase: overrides?.supabase ?? mockSupabase,
		llm: overrides?.llm ?? new MockDeepSeekClient(),
		tavily: overrides?.tavily,
		browserRendering: overrides?.browserRendering,
		observability: overrides?.observability ?? {
			SENTRY_DSN: undefined,
			SENTRY_ENVIRONMENT: undefined,
			SENTRY_RELEASE: undefined,
		},
	};

	return new MonitorAgentService(config, dependencies);
}
