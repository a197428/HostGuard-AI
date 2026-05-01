import * as Sentry from "@sentry/cloudflare";
import { logStructured, type StructuredLogContext } from "./logging";

export interface SentryLikeEnv {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
}

function normalizeError(error: unknown): {
  type: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      type: error.name || "Error",
      message: error.message,
      stack: error.stack ?? undefined,
    };
  }

  return {
    type: "Error",
    message: typeof error === "string" ? error : "Unknown error",
  };
}

export async function reportError(
  env: SentryLikeEnv,
  context: StructuredLogContext,
  error: unknown,
): Promise<void> {
  logStructured("error", {
    ...context,
    data: {
      ...(context.data ?? {}),
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : { message: typeof error === "string" ? error : "Unknown error" },
    },
  });

  try {
    if (env.SENTRY_DSN && Sentry.isInitialized()) {
      Sentry.withScope((scope) => {
        scope.setTag("trace_id", context.trace_id);
        scope.setTag("owner_id", context.owner_id);
        scope.setTag("property_id", context.property_id);
        scope.setContext("hostguard", {
          message: context.message,
          ...(context.data ?? {}),
          error: normalizeError(error),
        });
        Sentry.captureException(error);
      });
    }
  } catch {
    // Sentry must never block the primary error path.
  }
}
