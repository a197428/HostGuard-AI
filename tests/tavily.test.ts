// =============================================================================
// Tests for Tavily API Client
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MockTavilyClient,
  TavilyApiError,
  TavilyClient,
  TavilyExtractionError,
  type ScrapedReview,
  type TavilyExtractResponse,
  type TavilySearchResponse,
} from "../src/backend/infrastructure/tavily";

// =============================================================================
// TavilyClient Tests
// =============================================================================

describe("TavilyClient", () => {
  let client: TavilyClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new TavilyClient({
      apiKey: "test-key",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
  });

  describe("search", () => {
    it("should perform a search and return results", async () => {
      const mockResponse: TavilySearchResponse = {
        query: "test query",
        results: [
          {
            title: "Test Result",
            url: "https://example.com",
            content: "Test content",
            score: 0.95,
          },
        ],
        responseTime: 150,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.search("test query");

      expect(result.query).toBe("test query");
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.title).toBe("Test Result");
      expect(result.results[0]?.content).toBe("Test content");
    });

    it("should throw TavilyApiError on non-ok response", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Unauthorized",
        json: async () => {
          throw new Error("Not JSON");
        },
        headers: new Headers(),
        redirected: false,
        type: "basic" as const,
        url: "",
        clone: function () {
          return this;
        },
        body: null,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
      } as unknown as Response;

      mockFetch.mockResolvedValue(mockResponse);

      await expect(client.search("test")).rejects.toThrow(TavilyApiError);
      await expect(client.search("test")).rejects.toThrow(
        "Tavily search API error: 401",
      );
    });

    it("should pass search options correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: "test",
          results: [],
          responseTime: 100,
        }),
      });

      await client.search("test", {
        maxResults: 5,
        searchDepth: "advanced",
        includeAnswer: true,
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body ?? "{}");
      expect(callBody.max_results).toBe(5);
      expect(callBody.search_depth).toBe("advanced");
      expect(callBody.include_answer).toBe(true);
    });
  });

  describe("extract", () => {
    it("should extract content from a URL", async () => {
      const mockResponse: TavilyExtractResponse = {
        results: [
          {
            url: "https://example.com",
            content: "Extracted content",
          },
        ],
        responseTime: 200,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.extract("https://example.com");

      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.content).toBe("Extracted content");
    });

    it("should throw TavilyApiError on extract failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
      });

      await expect(client.extract("https://example.com")).rejects.toThrow(
        TavilyApiError,
      );
    });
  });

  describe("extractReviewsFromUrl", () => {
    it("should extract and parse reviews from a URL", async () => {
      const mockContent = `
        Отзывы гостей
        
        Иван П.
        Рейтинг: 5
        Отличные апартаменты, всё понравилось!
        15.03.2026
        
        Мария С.
        Рейтинг: 3
        Нормально, но могло быть лучше
        10.03.2026
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ url: "https://example.com", content: mockContent }],
          responseTime: 300,
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

    it("should throw TavilyExtractionError when no content extracted", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          responseTime: 100,
        }),
      });

      await expect(
        client.extractReviewsFromUrl("https://example.com", "avito"),
      ).rejects.toThrow(TavilyExtractionError);
    });
  });
});

// =============================================================================
// MockTavilyClient Tests
// =============================================================================

describe("MockTavilyClient", () => {
  let mockClient: MockTavilyClient;

  beforeEach(() => {
    mockClient = new MockTavilyClient();
  });

  it("should return empty results by default", async () => {
    const searchResult = await mockClient.search("test");
    expect(searchResult.results).toHaveLength(0);

    const extractResult = await mockClient.extract("https://example.com");
    expect(extractResult.results).toHaveLength(0);

    const reviews = await mockClient.extractReviewsFromUrl(
      "https://example.com",
      "yandex",
    );
    expect(reviews).toHaveLength(0);
  });

  it("should return preset search response", async () => {
    mockClient.setResponse("test query", {
      searchResponse: {
        query: "test query",
        results: [
          {
            title: "Mock Result",
            url: "https://mock.com",
            content: "Mock content",
            score: 0.99,
          },
        ],
        responseTime: 50,
      },
    });

    const result = await mockClient.search("test query");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.title).toBe("Mock Result");
  });

  it("should return preset extract response", async () => {
    mockClient.setResponse("https://example.com", {
      extractResponse: {
        results: [
          {
            url: "https://example.com",
            content: "Mock extracted content",
          },
        ],
        responseTime: 50,
      },
    });

    const result = await mockClient.extract("https://example.com");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.content).toBe("Mock extracted content");
  });

  it("should return preset reviews", async () => {
    const mockReviews: ScrapedReview[] = [
      {
        platform: "avito",
        platformReviewId: "mock_1",
        rating: 5,
        text: "Great place!",
        reviewDate: "2026-03-15",
        url: "https://avito.example.com",
      },
    ];

    mockClient.setResponse("https://avito.example.com", {
      reviews: mockReviews,
    });

    const reviews = await mockClient.extractReviewsFromUrl(
      "https://avito.example.com",
      "avito",
    );
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.rating).toBe(5);
    expect(reviews[0]?.text).toBe("Great place!");
  });
});
