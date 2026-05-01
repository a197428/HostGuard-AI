import type { Property, Review } from "@shared/types";

const API_BASE = "/api";

async function request<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { message?: string }).message ?? `API error: ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Properties
  getProperties: () => request<Property[]>("/properties"),

  getProperty: (id: string) => request<Property>(`/properties/${id}`),

  // Reviews
  getReviews: (params?: {
    propertyId?: string;
    status?: string;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.propertyId) searchParams.set("property_id", params.propertyId);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return request<Review[]>(`/reviews${qs ? `?${qs}` : ""}`);
  },

  getReview: (id: string) => request<Review>(`/reviews/${id}`),

  updateReview: (id: string, data: Partial<Review>) =>
    request<Review>(`/reviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Appeal
  approveAppeal: (reviewId: string) =>
    request<{ success: boolean }>(`/reviews/${reviewId}/approve`, {
      method: "POST",
    }),

  rejectAppeal: (reviewId: string) =>
    request<{ success: boolean }>(`/reviews/${reviewId}/reject`, {
      method: "POST",
    }),

  requestRevision: (reviewId: string, feedback: string) =>
    request<{ success: boolean }>(`/reviews/${reviewId}/revision`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    }),
};
