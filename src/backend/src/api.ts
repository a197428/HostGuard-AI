// =============================================================================
// REST API for HostGuard AI
// Hono-based API endpoints for property management and review history
// =============================================================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";
import type { Env } from "../env";
import {
  createSupabaseClient,
  SupabaseRepository,
} from "../infrastructure/supabase";
import { logStructured } from "../infrastructure/logging";
import { handleTelegramWebhook } from "../infrastructure/telegram";

// =============================================================================
// Request validation schemas
// =============================================================================

const CreatePropertySchema = z.object({
  owner_id: z.string().uuid(),
  name: z.string().min(1, "Property name is required"),
  address: z.string().optional(),
  features: z.record(z.unknown()).optional(),
  typical_complaints: z.array(z.string()).optional(),
  monitoring_interval: z.number().int().positive().default(120),
  is_monitoring_active: z.boolean().default(true),
});

const UpdatePropertySchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  features: z.record(z.unknown()).optional(),
  typical_complaints: z.array(z.string()).optional(),
  monitoring_interval: z.number().int().positive().optional(),
  is_monitoring_active: z.boolean().optional(),
});

const CreatePropertyUrlSchema = z.object({
  platform: z.enum(["avito", "ostrovok", "yandex"]),
  url: z.string().url("Must be a valid URL"),
});

const UpdateReviewSchema = z.object({
  status: z
    .enum([
      "new",
      "draft_ready",
      "approved",
      "edited",
      "rejected",
      "appeal_sent",
      "appeal_success",
      "appeal_denied",
    ])
    .optional(),
  public_response_edited: z.string().optional(),
});

// =============================================================================
// Helper: parse and validate JSON body
// =============================================================================

async function parseBody<T>(
  request: Request,
  schema: z.ZodSchema<T>,
): Promise<{ data: T; error?: undefined } | { data?: undefined; error: string }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      return { error: result.error.errors.map((e) => e.message).join(", ") };
    }
    return { data: result.data };
  } catch {
    return { error: "Invalid JSON body" };
  }
}

// =============================================================================
// Helper: create repository from env
// =============================================================================

function createRepo(env: Env): SupabaseRepository {
  const supabase = createSupabaseClient(
    env.SUPABASE_URL ?? "",
    env.SUPABASE_SERVICE_KEY ?? "",
    { auth: { persistSession: false } },
  );
  return new SupabaseRepository(supabase);
}

// =============================================================================
// API Router
// =============================================================================

export function createApiRouter(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // Middleware
  app.use("*", cors());
  app.use("*", logger());

  // Health check
  app.get("/healthz", (c) => {
    return c.json({
      ok: true,
      service: "hostguard-ai-backend",
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================================================
  // Properties CRUD
  // ==========================================================================

  // GET /api/properties - List all properties for an owner
  app.get("/api/properties", async (c) => {
    try {
      const ownerId = c.req.query("owner_id");
      if (!ownerId) {
        return c.json({ error: "owner_id query parameter is required" }, 400);
      }

      const repo = createRepo(c.env);
      const properties = await repo.getProperties(ownerId);

      return c.json({ data: properties });
    } catch (error) {
      logStructured("error", {
        trace_id: `api_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Failed to list properties",
        data: { error: error instanceof Error ? error.message : "Unknown" },
      });
      return c.json({ error: "Failed to list properties" }, 500);
    }
  });

  // POST /api/properties - Create a new property
  app.post("/api/properties", async (c) => {
    try {
      const parsed = await parseBody(c.req.raw, CreatePropertySchema);
      if (parsed.error) {
        return c.json({ error: parsed.error }, 400);
      }

      const repo = createRepo(c.env);
      const property = await repo.createProperty(parsed.data as any);

      return c.json({ data: property }, 201);
    } catch (error) {
      logStructured("error", {
        trace_id: `api_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Failed to create property",
        data: { error: error instanceof Error ? error.message : "Unknown" },
      });
      return c.json({ error: "Failed to create property" }, 500);
    }
  });

  // GET /api/properties/:id - Get property details
  app.get("/api/properties/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const repo = createRepo(c.env);
      const property = await repo.getProperty(id);

      if (!property) {
        return c.json({ error: "Property not found" }, 404);
      }

      return c.json({ data: property });
    } catch (error) {
      logStructured("error", {
        trace_id: `api_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Failed to get property",
        data: { error: error instanceof Error ? error.message : "Unknown" },
      });
      return c.json({ error: "Failed to get property" }, 500);
    }
  });

  // PUT /api/properties/:id - Update property
  app.put("/api/properties/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const parsed = await parseBody(c.req.raw, UpdatePropertySchema);
      if (parsed.error) {
        return c.json({ error: parsed.error }, 400);
      }

      const repo = createRepo(c.env);
      const property = await repo.updateProperty(id, parsed.data as any);

      return c.json({ data: property });
    } catch (error) {
      logStructured("error", {
        trace_id: `api_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Failed to update property",
        data: { error: error instanceof Error ? error.message : "Unknown" },
      });
      return c.json({ error: "Failed to update property" }, 500);
    }
  });

  // DELETE /api/properties/:id - Soft delete property
  app.delete("/api/properties/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const repo = createRepo(c.env);
      await repo.updateProperty(id, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      } as any);

      return c.json({ success: true });
    } catch (error) {
      logStructured("error", {
        trace_id: `api_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Failed to delete property",
        data: { error: error instanceof Error ? error.message : "Unknown" },
      });
      return c.json({ error: "Failed to delete property" }, 500);
    }
  });

  // ==========================================================================
  // Property URLs
  // ==========================================================================

  // GET /api/properties/:id/urls - List URLs for a property
  app.get("/api/properties/:id/urls", async (c) => {
    try {
      const propertyId = c.req.param("id");
      const repo = createRepo(c.env);
      const urls = await repo.getPropertyUrls(propertyId);

      return c.json({ data: urls });
    } catch (error) {
      logStructured("error", {
        trace_id: `api_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Failed to list property URLs",
        data: { error: error instanceof Error ? error.message : "Unknown" },
      });
      return c.json({ error: "Failed to list property URLs" }, 500);
    }
  });

  // POST /api/properties/:id/urls - Add a URL for a property
  app.post("/api/properties/:id/urls", async (c) => {
    try {
      const propertyId = c.req.param("id");
      const parsed = await parseBody(c.req.raw, CreatePropertyUrlSchema);
      if (parsed.error || !parsed.data) {
        return c.json({ error: parsed.error ?? "Invalid request body" }, 400);
      }

      const repo = createRepo(c.env);
      const url = await repo.createPropertyUrl(
        propertyId,
        parsed.data.platform,
        parsed.data.url,
      );

      return c.json({ data: url }, 201);
    } catch (error) {
      logStructured("error", {
        trace_id: `api_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Failed to create property URL",
        data: { error: error instanceof Error ? error.message : "Unknown" },
      });
      return c.json({ error: "Failed to create property URL" }, 500);
    }
  });

  // ==========================================================================
  // Reviews
  // ==========================================================================

  // GET /api/properties/:id/reviews - List reviews for a property
  app.get("/api/properties/:id/reviews", async (c) => {
    try {
      const propertyId = c.req.param("id");
      const repo = createRepo(c.env);
      const reviews = await repo.getReviews(propertyId);

      return c.json({ data: reviews });
    } catch (error) {
      logStructured("error", {
        trace_id: `api_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Failed to list reviews",
        data: { error: error instanceof Error ? error.message : "Unknown" },
      });
      return c.json({ error: "Failed to list reviews" }, 500);
    }
  });

  // GET /api/reviews/:id - Get review details
  app.get("/api/reviews/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const supabase = createSupabaseClient(
        c.env.SUPABASE_URL ?? "",
        c.env.SUPABASE_SERVICE_KEY ?? "",
        { auth: { persistSession: false } },
      );

      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        return c.json({ error: "Review not found" }, 404);
      }

      return c.json({ data });
    } catch (error) {
      logStructured("error", {
        trace_id: `api_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Failed to get review",
        data: { error: error instanceof Error ? error.message : "Unknown" },
      });
      return c.json({ error: "Failed to get review" }, 500);
    }
  });

  // PUT /api/reviews/:id - Update review status/response
  app.put("/api/reviews/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const parsed = await parseBody(c.req.raw, UpdateReviewSchema);
      if (parsed.error) {
        return c.json({ error: parsed.error }, 400);
      }

      const repo = createRepo(c.env);
      const review = await repo.updateReview(id, parsed.data as any);

      return c.json({ data: review });
    } catch (error) {
      logStructured("error", {
        trace_id: `api_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Failed to update review",
        data: { error: error instanceof Error ? error.message : "Unknown" },
      });
      return c.json({ error: "Failed to update review" }, 500);
    }
  });

  // ==========================================================================
  // Telegram Webhook
  // ==========================================================================

  // POST /api/telegram/webhook - Handle incoming Telegram updates
  app.post("/api/telegram/webhook", async (c) => {
    return handleTelegramWebhook(c.req.raw, c.env);
  });

  return app;
}
