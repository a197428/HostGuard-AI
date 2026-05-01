import type { Property, Review } from "@shared/types";
import { supabase } from "@/lib/supabase";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "") + "/api";

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      (error as { message?: string; error?: string }).message ??
      (error as { error?: string }).error ??
      response.statusText ??
      `API error: ${response.status}`;
    throw new Error(message);
  }

  const body = (await response.json()) as
    | T
    | {
        data?: T;
      };

  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

export const api = {
  // Properties
  getProperties: () => request<Property[]>("/properties"),

  getProperty: (id: string) => request<Property>(`/properties/${id}`),

  // Reviews
  getPropertyReviews: (propertyId: string) =>
    request<Review[]>(`/properties/${propertyId}/reviews`),

  getReview: (id: string) => request<Review>(`/reviews/${id}`),

  updateReview: (id: string, data: Partial<Review>) =>
    request<Review>(`/reviews/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
