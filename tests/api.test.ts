// =============================================================================
// Tests for REST API
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApiRouter } from "../src/backend/src/api";
import type { Env } from "../src/backend/env";

// =============================================================================
// Mock Supabase module to prevent real connections
// =============================================================================

vi.mock("../src/backend/infrastructure/supabase", () => {
  const mockRepo = {
    getProperties: vi
      .fn()
      .mockRejectedValue(new Error("Supabase not configured")),
    getProperty: vi
      .fn()
      .mockRejectedValue(new Error("Supabase not configured")),
    createProperty: vi
      .fn()
      .mockRejectedValue(new Error("Supabase not configured")),
    updateProperty: vi
      .fn()
      .mockRejectedValue(new Error("Supabase not configured")),
    getPropertyUrls: vi
      .fn()
      .mockRejectedValue(new Error("Supabase not configured")),
    createPropertyUrl: vi
      .fn()
      .mockRejectedValue(new Error("Supabase not configured")),
    getReviews: vi.fn().mockRejectedValue(new Error("Supabase not configured")),
    updateReview: vi
      .fn()
      .mockRejectedValue(new Error("Supabase not configured")),
  };

  // Mock supabase client that returns empty results for any table query
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "Not found" } }),
  };

  const mockSupabaseClient = {
    from: vi.fn().mockReturnValue(mockQueryBuilder),
  };

  return {
    createSupabaseClient: vi.fn().mockReturnValue(mockSupabaseClient),
    SupabaseRepository: vi.fn().mockImplementation(() => mockRepo),
  };
});

// =============================================================================
// Mock Env
// =============================================================================

function createMockEnv(): Env {
  return {
    MonitorAgent: {} as DurableObjectNamespace,
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SERVICE_KEY: "mock-service-key",
  };
}

// =============================================================================
// API Tests
// =============================================================================

describe("API Router", () => {
  let router: ReturnType<typeof createApiRouter>;
  let env: Env;

  beforeEach(() => {
    router = createApiRouter();
    env = createMockEnv();
  });

  describe("GET /healthz", () => {
    it("should return health check response", async () => {
      const request = new Request("http://localhost/healthz");
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("ok", true);
      expect(body).toHaveProperty("service", "hostguard-ai-backend");
    });
  });

  describe("GET /api/properties", () => {
    it("should return 400 when owner_id is missing", async () => {
      const request = new Request("http://localhost/api/properties");
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("should return 500 when Supabase is not configured", async () => {
      const request = new Request(
        "http://localhost/api/properties?owner_id=00000000-0000-0000-0000-000000000000",
      );
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });

  describe("POST /api/properties", () => {
    it("should return 400 for invalid JSON body", async () => {
      const request = new Request("http://localhost/api/properties", {
        method: "POST",
        body: "invalid json",
        headers: { "content-type": "application/json" },
      });
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("should return 400 for missing required fields", async () => {
      const request = new Request("http://localhost/api/properties", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      });
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("should return 400 for invalid owner_id", async () => {
      const request = new Request("http://localhost/api/properties", {
        method: "POST",
        body: JSON.stringify({
          owner_id: "not-a-uuid",
          name: "Test Property",
        }),
        headers: { "content-type": "application/json" },
      });
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });

  describe("GET /api/properties/:id", () => {
    it("should return 500 when Supabase is not configured", async () => {
      const request = new Request(
        "http://localhost/api/properties/00000000-0000-0000-0000-000000000000",
      );
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });

  describe("PUT /api/properties/:id", () => {
    it("should return 400 for invalid JSON body", async () => {
      const request = new Request(
        "http://localhost/api/properties/00000000-0000-0000-0000-000000000000",
        {
          method: "PUT",
          body: "invalid json",
          headers: { "content-type": "application/json" },
        },
      );
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });

  describe("DELETE /api/properties/:id", () => {
    it("should return 500 when Supabase is not configured", async () => {
      const request = new Request(
        "http://localhost/api/properties/00000000-0000-0000-0000-000000000000",
        { method: "DELETE" },
      );
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });

  describe("GET /api/properties/:id/urls", () => {
    it("should return 500 when Supabase is not configured", async () => {
      const request = new Request(
        "http://localhost/api/properties/00000000-0000-0000-0000-000000000000/urls",
      );
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });

  describe("POST /api/properties/:id/urls", () => {
    it("should return 400 for invalid URL", async () => {
      const request = new Request(
        "http://localhost/api/properties/00000000-0000-0000-0000-000000000000/urls",
        {
          method: "POST",
          body: JSON.stringify({
            platform: "avito",
            url: "not-a-url",
          }),
          headers: { "content-type": "application/json" },
        },
      );
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("should return 400 for invalid platform", async () => {
      const request = new Request(
        "http://localhost/api/properties/00000000-0000-0000-0000-000000000000/urls",
        {
          method: "POST",
          body: JSON.stringify({
            platform: "invalid",
            url: "https://example.com",
          }),
          headers: { "content-type": "application/json" },
        },
      );
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });

  describe("GET /api/properties/:id/reviews", () => {
    it("should return 500 when Supabase is not configured", async () => {
      const request = new Request(
        "http://localhost/api/properties/00000000-0000-0000-0000-000000000000/reviews",
      );
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });

  describe("GET /api/reviews/:id", () => {
    it("should return 404 when review not found", async () => {
      const request = new Request(
        "http://localhost/api/reviews/00000000-0000-0000-0000-000000000000",
      );
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });

  describe("PUT /api/reviews/:id", () => {
    it("should return 400 for invalid JSON body", async () => {
      const request = new Request(
        "http://localhost/api/reviews/00000000-0000-0000-0000-000000000000",
        {
          method: "PUT",
          body: "invalid json",
          headers: { "content-type": "application/json" },
        },
      );
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("should return 400 for invalid status value", async () => {
      const request = new Request(
        "http://localhost/api/reviews/00000000-0000-0000-0000-000000000000",
        {
          method: "PUT",
          body: JSON.stringify({ status: "invalid_status" }),
          headers: { "content-type": "application/json" },
        },
      );
      const response = await router.fetch(request, env, {} as ExecutionContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });
});
