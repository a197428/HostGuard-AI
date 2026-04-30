import { Agent, callable } from "agents";
import type { Env } from "../env";
import {
  MonitorAgentService,
  createMonitorAgentDependencies,
  type MonitorAgentExecutionInput,
  type ThinkActState,
} from "./monitor";

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
}
