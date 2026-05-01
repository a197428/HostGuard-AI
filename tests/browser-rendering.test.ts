// =============================================================================
// Tests for Browser Rendering Client
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BrowserRenderingClient,
  MockBrowserRenderingClient,
} from "../src/backend/infrastructure/browser-rendering";

// =============================================================================
// BrowserRenderingClient Tests
// =============================================================================

describe("BrowserRenderingClient", () => {
  let client: BrowserRenderingClient;
  let mockBinding: { fetch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockBinding = { fetch: vi.fn() };
    client = new BrowserRenderingClient({
      binding: mockBinding as unknown as Fetcher,
    });
  });

  describe("fetchPage", () => {
    it("should fetch and return page content", async () => {
      mockBinding.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "<html><body>Test content</body></html>",
          title: "Test Page",
        }),
      });

      const result = await client.fetchPage("https://example.com");

      expect(result.content).toContain("Test content");
      expect(result.title).toBe("Test Page");
      expect(result.url).toBe("https://example.com");
    });

    it("should throw on non-ok response", async () => {
      mockBinding.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(client.fetchPage("https://example.com")).rejects.toThrow(
        "Browser Rendering error: 500",
      );
    });
  });

  describe("extractReviewsFromUrl", () => {
    it("should extract reviews from rendered HTML", async () => {
      const html = `
        <html>
          <body>
            <div class="review">
              <span class="rating">Рейтинг: 4</span>
              <p class="text">Хороший номер, чисто и уютно</p>
              <span class="date">15.03.2026</span>
            </div>
            <div class="review">
              <span class="rating">Рейтинг: 5</span>
              <p class="text">Отличное место!</p>
              <span class="date">10.03.2026</span>
            </div>
          </body>
        </html>
      `;

      mockBinding.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: html,
          title: "Reviews Page",
        }),
      });

      const reviews = await client.extractReviewsFromUrl(
        "https://example.com",
        "ostrovok",
      );

      expect(reviews.length).toBeGreaterThanOrEqual(1);
      expect(reviews[0]?.platform).toBe("ostrovok");
      expect(reviews[0]?.rating).toBeGreaterThanOrEqual(1);
      expect(reviews[0]?.rating).toBeLessThanOrEqual(5);
    });

    it("should handle empty HTML gracefully", async () => {
      mockBinding.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "",
          title: "Empty Page",
        }),
      });

      const reviews = await client.extractReviewsFromUrl(
        "https://example.com",
        "avito",
      );

      expect(reviews).toHaveLength(0);
    });

    it("should throw on fetch error", async () => {
      mockBinding.fetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        client.extractReviewsFromUrl("https://example.com", "yandex"),
      ).rejects.toThrow("Network error");
    });
  });
});

// =============================================================================
// MockBrowserRenderingClient Tests
// =============================================================================

describe("MockBrowserRenderingClient", () => {
  let mockClient: MockBrowserRenderingClient;

  beforeEach(() => {
    mockClient = new MockBrowserRenderingClient();
  });

  it("should return empty content by default", async () => {
    const result = await mockClient.fetchPage("https://example.com");
    expect(result.content).toBe("");
    expect(result.url).toBe("https://example.com");
  });

  it("should return preset response", async () => {
    mockClient.setResponse("https://example.com", {
      content: "<html>Mock content</html>",
      url: "https://example.com",
      title: "Mock Page",
    });

    const result = await mockClient.fetchPage("https://example.com");
    expect(result.content).toBe("<html>Mock content</html>");
    expect(result.title).toBe("Mock Page");
  });

  it("should extract reviews from preset HTML", async () => {
    mockClient.setResponse("https://example.com", {
      content: `
        <div>Рейтинг: 4</div>
        <div>Хороший номер</div>
        <div>15.03.2026</div>
      `,
      url: "https://example.com",
    });

    const reviews = await mockClient.extractReviewsFromUrl(
      "https://example.com",
      "ostrovok",
    );

    expect(reviews.length).toBeGreaterThanOrEqual(1);
  });
});
