import { Agent, callable } from "agents";
import { z } from "zod";
import type { Env } from "../env";
import {
  MonitorAgentService,
  createMonitorAgentDependencies,
  type MonitorAgentExecutionInput,
  type ThinkActState,
} from "./monitor";

const MonitorRunRequestSchema = z.object({
  config: z.object({
    propertyId: z.string().uuid(),
    ownerId: z.string().uuid(),
    monitoringIntervalMinutes: z.number().int().positive(),
  }),
  context: z.object({
    reviewText: z.string().min(1),
    platform: z.enum(["avito", "ostrovok", "yandex"]),
    platformReviewId: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    reviewDate: z.string().optional(),
    propertyUrl: z.string().url().optional(),
  }),
});

export class MonitorAgent extends Agent<Env, ThinkActState> {
  initialState: ThinkActState = {
    currentStep: "TRIGGER",
    retryCount: 0,
  };

  // Cloudflare Agents SDK callable method for the ThinkActLoop entrypoint.
  // The decorator is runtime-specific; tests exercise the pure service instead.
  // @ts-ignore
  @callable()
  async runThinkActLoop(
    input: MonitorAgentExecutionInput,
  ): Promise<ThinkActState> {
    const service = new MonitorAgentService(
      input.config,
      createMonitorAgentDependencies(this.env),
      this.state,
    );

    const result = await service.execute(input.context);
    this.setState(result);
    return result;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/monitor/run") {
      return new Response("Not found", { status: 404 });
    }

    try {
      const payload = MonitorRunRequestSchema.parse(await request.json());
      const result = await this.runThinkActLoop(payload);
      return new Response(JSON.stringify({ ok: true, data: result }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Invalid payload",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        },
      );
    }
  }
}
