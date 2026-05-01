import * as Sentry from '@sentry/cloudflare';
import { routeAgentRequest } from 'agents';
import type { MonitorAgentExecutionInput } from '../agents/monitor';
import { MonitorAgent } from '../agents/monitor-agent';
import type { Env } from '../env';
import { BrowserRenderingClient } from '../infrastructure/browser-rendering';
import { logStructured } from '../infrastructure/logging';
import {
	SupabaseRepository,
	createSupabaseClient,
} from '../infrastructure/supabase';
import { TavilyClient, type ScrapedReview } from '../infrastructure/tavily';
import { createApiRouter } from './api';

export { MonitorAgent };

const apiRouter = createApiRouter();

function shouldMonitorProperty(
	property: { monitoring_interval: number; updated_at?: string },
	currentTime: Date,
): boolean {
	if (!property.monitoring_interval || property.monitoring_interval <= 0) {
		return true; // Если интервал не задан или <= 0, мониторим всегда
	}

	if (!property.updated_at) {
		return true; // Если нет updated_at, мониторим
	}

	const lastMonitored = new Date(property.updated_at);
	const minutesSinceLastMonitor =
		(currentTime.getTime() - lastMonitored.getTime()) / (1000 * 60);

	return minutesSinceLastMonitor >= property.monitoring_interval;
}

function toExecutionInput(
	property: { id: string; owner_id: string; monitoring_interval: number },
	review: ScrapedReview,
): MonitorAgentExecutionInput {
	return {
		config: {
			propertyId: property.id,
			ownerId: property.owner_id,
			monitoringIntervalMinutes: property.monitoring_interval,
		},
		context: {
			reviewText: review.text,
			platform: review.platform,
			platformReviewId: review.platformReviewId,
			rating: review.rating,
			reviewDate: review.reviewDate,
			propertyUrl: review.url,
		},
	};
}

async function collectReviewsForProperty(
	env: Env,
	propertyUrls: Array<{
		platform: 'avito' | 'ostrovok' | 'yandex';
		url: string;
	}>,
	traceId: string,
	ownerId: string,
	propertyId: string,
): Promise<ScrapedReview[]> {
	const tavily = env.TAVILY_API_KEY
		? new TavilyClient({ apiKey: env.TAVILY_API_KEY })
		: undefined;
	const browserRendering = env.BROWSER_RENDERING
		? new BrowserRenderingClient({ binding: env.BROWSER_RENDERING })
		: undefined;

	const reviews: ScrapedReview[] = [];
	for (const propertyUrl of propertyUrls) {
		if (tavily) {
			try {
				const tavilyReviews = await tavily.extractReviewsFromUrl(
					propertyUrl.url,
					propertyUrl.platform,
				);
				reviews.push(...tavilyReviews);
				continue;
			} catch (error) {
				logStructured('warn', {
					trace_id: traceId,
					owner_id: ownerId,
					property_id: propertyId,
					message:
						'Tavily review extraction failed for property URL, trying fallback',
					data: {
						platform: propertyUrl.platform,
						url: propertyUrl.url,
						error: error instanceof Error ? error.message : 'Unknown',
					},
				});
			}
		}

		if (browserRendering) {
			try {
				const fallbackReviews = await browserRendering.extractReviewsFromUrl(
					propertyUrl.url,
					propertyUrl.platform,
				);
				reviews.push(...fallbackReviews);
			} catch (error) {
				logStructured('error', {
					trace_id: traceId,
					owner_id: ownerId,
					property_id: propertyId,
					message:
						'Both Tavily and Browser Rendering failed for property URL extraction',
					data: {
						platform: propertyUrl.platform,
						url: propertyUrl.url,
						error: error instanceof Error ? error.message : 'Unknown',
					},
				});
			}
		}
	}

	return reviews;
}

const workerHandler = {
	async fetch(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// Health check
		if (url.pathname === '/healthz') {
			return new Response(
				JSON.stringify({
					ok: true,
					service: 'hostguard-ai-backend',
				}),
				{
					status: 200,
					headers: {
						'content-type': 'application/json; charset=utf-8',
					},
				},
			);
		}

		// Route API requests through Hono router
		if (url.pathname.startsWith('/api/')) {
			return apiRouter.fetch(request, env, _ctx);
		}

		// Route Agent requests (Durable Objects)
		const routedResponse = await routeAgentRequest(request, env);
		if (routedResponse) {
			return routedResponse;
		}

		return new Response('HostGuard AI Backend', { status: 404 });
	},

	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		const traceId = `cron_${controller.scheduledTime}`;

		logStructured('info', {
			trace_id: traceId,
			owner_id: 'system',
			property_id: 'system',
			message: 'Cron triggered — starting periodic monitoring',
			data: {
				scheduled_time: controller.scheduledTime,
			},
		});

		try {
			// Создаём Supabase клиент для чтения активных объектов
			const supabaseUrl = env.SUPABASE_URL;
			const supabaseServiceKey = env.SUPABASE_SERVICE_KEY;

			if (!supabaseUrl || !supabaseServiceKey) {
				logStructured('error', {
					trace_id: traceId,
					owner_id: 'system',
					property_id: 'system',
					message: 'Supabase credentials not configured, skipping cron',
					data: {},
				});
				return;
			}

			const supabase = new SupabaseRepository(
				createSupabaseClient(supabaseUrl, supabaseServiceKey, {
					auth: { persistSession: false },
				}),
			);

			// Получаем все активные объекты с мониторингом
			// Используем прямой SQL-запрос через Supabase client
			const { data: properties, error } = await (supabase as any).client
				.from('properties')
				.select('*')
				.eq('is_monitoring_active', true)
				.eq('is_deleted', false);

			if (error) {
				logStructured('error', {
					trace_id: traceId,
					owner_id: 'system',
					property_id: 'system',
					message: 'Failed to fetch active properties',
					data: { error: error.message },
				});
				return;
			}

			if (!properties || properties.length === 0) {
				logStructured('info', {
					trace_id: traceId,
					owner_id: 'system',
					property_id: 'system',
					message: 'No active properties to monitor',
					data: {},
				});
				return;
			}

			logStructured('info', {
				trace_id: traceId,
				owner_id: 'system',
				property_id: 'system',
				message: `Found ${properties.length} active properties for monitoring`,
				data: { property_count: properties.length },
			});

			// Для каждого активного объекта собираем отзывы и запускаем ThinkActLoop
			const currentTime = new Date();
			for (const property of properties) {
				// Проверяем, нужно ли мониторить этот объект сейчас
				if (!shouldMonitorProperty(property, currentTime)) {
					logStructured('info', {
						trace_id: traceId,
						owner_id: property.owner_id,
						property_id: property.id,
						message: 'Property monitoring interval not elapsed, skipping',
						data: {
							monitoring_interval_minutes: property.monitoring_interval,
							last_updated: property.updated_at,
							minutes_since_last_monitor: property.updated_at
								? (currentTime.getTime() -
										new Date(property.updated_at).getTime()) /
									(1000 * 60)
								: null,
						},
					});
					continue;
				}

				const propertyUrls = await supabase.getPropertyUrls(property.id);
				if (propertyUrls.length === 0) {
					logStructured('info', {
						trace_id: traceId,
						owner_id: property.owner_id,
						property_id: property.id,
						message: 'No property URLs configured, skipping monitoring run',
						data: {},
					});
					continue;
				}

				const reviews = await collectReviewsForProperty(
					env,
					propertyUrls.map(item => ({
						platform: item.platform,
						url: item.url,
					})),
					traceId,
					property.owner_id,
					property.id,
				);

				if (reviews.length === 0) {
					logStructured('info', {
						trace_id: traceId,
						owner_id: property.owner_id,
						property_id: property.id,
						message: 'No reviews collected for property in this cycle',
						data: { property_url_count: propertyUrls.length },
					});
					continue;
				}

				for (const review of reviews) {
					const doId = env.MonitorAgent.idFromName(`property_${property.id}`);
					const stub = env.MonitorAgent.get(doId);
					const input = toExecutionInput(property, review);

					ctx.waitUntil(
						stub
							.fetch('https://internal/monitor/run', {
								method: 'POST',
								headers: { 'content-type': 'application/json' },
								body: JSON.stringify(input),
							})
							.then(response => {
								if (!response.ok) {
									throw new Error(
										`MonitorAgent returned HTTP ${response.status}`,
									);
								}
								logStructured('info', {
									trace_id: traceId,
									owner_id: property.owner_id,
									property_id: property.id,
									message: 'MonitorAgent ThinkActLoop triggered successfully',
									data: {
										platform: review.platform,
										platform_review_id: review.platformReviewId,
									},
								});
							})
							.catch(err => {
								logStructured('error', {
									trace_id: traceId,
									owner_id: property.owner_id,
									property_id: property.id,
									message: 'MonitorAgent ThinkActLoop trigger failed',
									data: {
										platform: review.platform,
										platform_review_id: review.platformReviewId,
										error: err instanceof Error ? err.message : 'Unknown',
									},
								});
							}),
					);
				}
			}
		} catch (error) {
			logStructured('error', {
				trace_id: traceId,
				owner_id: 'system',
				property_id: 'system',
				message: 'Cron handler failed',
				data: {
					error: error instanceof Error ? error.message : 'Unknown',
				},
			});
		}
	},
};

export default Sentry.withSentry(
	(env: Env) => ({
		dsn: env.SENTRY_DSN,
		environment: env.SENTRY_ENVIRONMENT ?? 'production',
		release: env.SENTRY_RELEASE,
		enableLogs: true,
	}),
	workerHandler,
);

interface ScheduledController {
	scheduledTime: number;
}
