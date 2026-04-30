import { routeAgentRequest } from "agents";
import { MonitorAgent } from "../agents/monitor-agent";
import { createApiRouter } from "./api";
import type { Env } from "../env";

export { MonitorAgent };

const apiRouter = createApiRouter();

export default {
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
    console.info(
      JSON.stringify({
        level: "info",
        trace_id: `cron_${controller.scheduledTime}`,
        owner_id: "system",
        property_id: "system",
        timestamp: new Date().toISOString(),
        message: "Cron triggered",
        scheduled_time: controller.scheduledTime,
      }),
    );
  },
};

interface ScheduledController {
  scheduledTime: number;
}
