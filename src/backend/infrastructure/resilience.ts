// =============================================================================
// Resilience patterns for HostGuard AI backend
// Circuit Breaker, Bulkhead, Timeout, Retry with exponential backoff
// =============================================================================

import { logStructured } from "./logging";

// =============================================================================
// Circuit Breaker
// =============================================================================

export interface CircuitBreakerConfig {
  threshold: number;       // Number of failures before opening
  resetTimeoutMs: number;  // Time before attempting half-open
  halfOpenMaxRequests: number; // Max requests in half-open state
}

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number;
  lastSuccess: number;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailure = 0;
  private lastSuccess = 0;
  private halfOpenRequests = 0;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig,
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    this.checkState();

    if (this.state === "open") {
      throw new CircuitBreakerOpenError(this.name);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
    };
  }

  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
    this.halfOpenRequests = 0;
  }

  private checkState(): void {
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailure;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.state = "half-open";
        this.halfOpenRequests = 0;
        logStructured("info", {
          trace_id: `circuit_breaker_${Date.now()}`,
          owner_id: "system",
          property_id: "system",
          message: `Circuit breaker "${this.name}" transitioning to half-open`,
          data: { elapsed_ms: elapsed },
        });
      }
    }
  }

  private onSuccess(): void {
    this.lastSuccess = Date.now();
    this.successes++;

    if (this.state === "half-open") {
      this.state = "closed";
      this.failures = 0;
      this.halfOpenRequests = 0;
      logStructured("info", {
        trace_id: `circuit_breaker_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: `Circuit breaker "${this.name}" reset to closed`,
        data: {},
      });
    }
  }

  private onFailure(): void {
    this.lastFailure = Date.now();
    this.failures++;

    if (this.state === "half-open") {
      this.halfOpenRequests++;
      if (this.halfOpenRequests >= this.config.halfOpenMaxRequests) {
        this.state = "open";
        logStructured("warn", {
          trace_id: `circuit_breaker_${Date.now()}`,
          owner_id: "system",
          property_id: "system",
          message: `Circuit breaker "${this.name}" re-opened from half-open`,
          data: { failures: this.failures },
        });
      }
      return;
    }

    if (this.failures >= this.config.threshold) {
      this.state = "open";
      logStructured("warn", {
        trace_id: `circuit_breaker_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: `Circuit breaker "${this.name}" opened`,
        data: { failures: this.failures, threshold: this.config.threshold },
      });
    }
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is open`);
    this.name = "CircuitBreakerOpenError";
  }
}

// =============================================================================
// Bulkhead (concurrency limiter)
// =============================================================================

export class Bulkhead {
  private activeCount = 0;
  private queue: Array<{
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    fn: () => Promise<unknown>;
  }> = [];

  constructor(
    private readonly name: string,
    private readonly maxConcurrent: number,
    private readonly maxQueue: number,
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount < this.maxConcurrent) {
      return this.execute(fn);
    }

    if (this.queue.length >= this.maxQueue) {
      throw new BulkheadRejectedError(this.name);
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        resolve: resolve as (value: unknown) => void,
        reject,
        fn: fn as () => Promise<unknown>,
      });
    });
  }

  getStats(): { activeCount: number; queueLength: number } {
    return {
      activeCount: this.activeCount,
      queueLength: this.queue.length,
    };
  }

  private async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) {
        this.execute(next.fn as () => Promise<unknown>)
          .then(next.resolve)
          .catch(next.reject);
      }
    }
  }
}

export class BulkheadRejectedError extends Error {
  constructor(name: string) {
    super(`Bulkhead "${name}" queue is full`);
    this.name = "BulkheadRejectedError";
  }
}

// =============================================================================
// Timeout
// =============================================================================

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(label, timeoutMs));
      }, timeoutMs);
    }),
  ]);
}

export class TimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`Operation "${label}" timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

// =============================================================================
// Retry with exponential backoff
// =============================================================================

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: Array<new (...args: unknown[]) => Error>;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableErrors: [],
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  label = "operation",
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < cfg.maxRetries && isRetryable(error, cfg.retryableErrors)) {
        const delay = Math.min(
          cfg.baseDelayMs * 2 ** (attempt - 1),
          cfg.maxDelayMs,
        );
        logStructured("warn", {
          trace_id: `retry_${Date.now()}`,
          owner_id: "system",
          property_id: "system",
          message: `Retry attempt ${attempt}/${cfg.maxRetries} for "${label}"`,
          data: {
            attempt,
            delay_ms: delay,
            error: error instanceof Error ? error.message : "Unknown",
          },
        });
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

function isRetryable(
  error: unknown,
  retryableErrors: Array<new (...args: unknown[]) => Error>,
): boolean {
  if (retryableErrors.length === 0) return true;
  return retryableErrors.some(
    (ErrorType) => error instanceof ErrorType,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Graceful degradation helpers
// =============================================================================

export interface FallbackResult<T> {
  value: T;
  fromCache: boolean;
  error?: Error;
}

export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  label: string,
): Promise<FallbackResult<T>> {
  try {
    const value = await primary();
    return { value, fromCache: false };
  } catch (error) {
    logStructured("warn", {
      trace_id: `fallback_${Date.now()}`,
      owner_id: "system",
      property_id: "system",
      message: `Primary "${label}" failed, using fallback`,
      data: { error: error instanceof Error ? error.message : "Unknown" },
    });

    try {
      const value = await fallback();
      return {
        value,
        fromCache: true,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } catch (fallbackError) {
      throw fallbackError;
    }
  }
}

// =============================================================================
// Resilience registry — central management of all resilience patterns
// =============================================================================

export interface ResilienceRegistryConfig {
  tavily: {
    circuitBreaker: CircuitBreakerConfig;
    bulkhead: { maxConcurrent: number; maxQueue: number };
    timeoutMs: number;
  };
  browserRendering: {
    circuitBreaker: CircuitBreakerConfig;
    bulkhead: { maxConcurrent: number; maxQueue: number };
    timeoutMs: number;
  };
  llm: {
    circuitBreaker: CircuitBreakerConfig;
    bulkhead: { maxConcurrent: number; maxQueue: number };
    timeoutMs: number;
  };
  supabase: {
    timeoutMs: number;
  };
  redis: {
    timeoutMs: number;
  };
}

export const DEFAULT_RESILIENCE_CONFIG: ResilienceRegistryConfig = {
  tavily: {
    circuitBreaker: { threshold: 5, resetTimeoutMs: 30_000, halfOpenMaxRequests: 3 },
    bulkhead: { maxConcurrent: 3, maxQueue: 10 },
    timeoutMs: 15_000,
  },
  browserRendering: {
    circuitBreaker: { threshold: 3, resetTimeoutMs: 60_000, halfOpenMaxRequests: 2 },
    bulkhead: { maxConcurrent: 2, maxQueue: 5 },
    timeoutMs: 30_000,
  },
  llm: {
    circuitBreaker: { threshold: 10, resetTimeoutMs: 60_000, halfOpenMaxRequests: 2 },
    bulkhead: { maxConcurrent: 2, maxQueue: 20 },
    timeoutMs: 30_000,
  },
  supabase: {
    timeoutMs: 10_000,
  },
  redis: {
    timeoutMs: 5_000,
  },
};

export class ResilienceRegistry {
  readonly tavilyCircuitBreaker: CircuitBreaker;
  readonly tavilyBulkhead: Bulkhead;
  readonly tavilyTimeoutMs: number;

  readonly browserRenderingCircuitBreaker: CircuitBreaker;
  readonly browserRenderingBulkhead: Bulkhead;
  readonly browserRenderingTimeoutMs: number;

  readonly llmCircuitBreaker: CircuitBreaker;
  readonly llmBulkhead: Bulkhead;
  readonly llmTimeoutMs: number;

  readonly supabaseTimeoutMs: number;
  readonly redisTimeoutMs: number;

  constructor(config: ResilienceRegistryConfig = DEFAULT_RESILIENCE_CONFIG) {
    this.tavilyCircuitBreaker = new CircuitBreaker("tavily", config.tavily.circuitBreaker);
    this.tavilyBulkhead = new Bulkhead("tavily", config.tavily.bulkhead.maxConcurrent, config.tavily.bulkhead.maxQueue);
    this.tavilyTimeoutMs = config.tavily.timeoutMs;

    this.browserRenderingCircuitBreaker = new CircuitBreaker("browser-rendering", config.browserRendering.circuitBreaker);
    this.browserRenderingBulkhead = new Bulkhead("browser-rendering", config.browserRendering.bulkhead.maxConcurrent, config.browserRendering.bulkhead.maxQueue);
    this.browserRenderingTimeoutMs = config.browserRendering.timeoutMs;

    this.llmCircuitBreaker = new CircuitBreaker("llm", config.llm.circuitBreaker);
    this.llmBulkhead = new Bulkhead("llm", config.llm.bulkhead.maxConcurrent, config.llm.bulkhead.maxQueue);
    this.llmTimeoutMs = config.llm.timeoutMs;

    this.supabaseTimeoutMs = config.supabase.timeoutMs;
    this.redisTimeoutMs = config.redis.timeoutMs;
  }

  async callTavily<T>(fn: () => Promise<T>): Promise<T> {
    return this.tavilyBulkhead.call(() =>
      this.tavilyCircuitBreaker.call(() =>
        withTimeout(fn(), this.tavilyTimeoutMs, "tavily"),
      ),
    );
  }

  async callBrowserRendering<T>(fn: () => Promise<T>): Promise<T> {
    return this.browserRenderingBulkhead.call(() =>
      this.browserRenderingCircuitBreaker.call(() =>
        withTimeout(fn(), this.browserRenderingTimeoutMs, "browser-rendering"),
      ),
    );
  }

  async callLLM<T>(fn: () => Promise<T>): Promise<T> {
    return this.llmBulkhead.call(() =>
      this.llmCircuitBreaker.call(() =>
        withTimeout(fn(), this.llmTimeoutMs, "llm"),
      ),
    );
  }

  async callSupabase<T>(fn: () => Promise<T>): Promise<T> {
    return withTimeout(fn(), this.supabaseTimeoutMs, "supabase");
  }

  async callRedis<T>(fn: () => Promise<T>): Promise<T> {
    return withTimeout(fn(), this.redisTimeoutMs, "redis");
  }
}
