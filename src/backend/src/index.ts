import * as Sentry from "@sentry/cloudflare";
import { routeAgentRequest } from "agents";
import { MonitorAgent } from "../agents/monitor-agent";
import { createApiRouter } from "./api";
import type { Env } from "../env";
import { logStructured } from "../infrastructure/logging";

export { MonitorAgent };

const apiRouter = createApiRouter();

const workerHandler = {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/healthz") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "hostguard-ai-backend",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        },
      );
    }

    // Route API requests through Hono router
    if (url.pathname.startsWith("/api/")) {
      return apiRouter.fetch(request, env, _ctx);
    }

    // Route Agent requests (Durable Objects)
    const routedResponse = await routeAgentRequest(request, env);
    if (routedResponse) {
      return routedResponse;
    }

    return new Response("HostGuard AI Backend", { status: 404 });
  },

  async scheduled(
    controller: ScheduledController,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    logStructured("info", {
      trace_id: `cron_${controller.scheduledTime}`,
      owner_id: "system",
      property_id: "system",
      message: "Cron triggered",
      data: {
        scheduled_time: controller.scheduledTime,
      },
    });
  },
};

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? "production",
    release: env.SENTRY_RELEASE,
    enableLogs: true,
  }),
  workerHandler,
);

interface ScheduledController {
  scheduledTime: number;
}
