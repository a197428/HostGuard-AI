import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Review, Property } from "@shared/types";
import { api } from "@/lib/api";

export const useReviewStore = defineStore("review", () => {
  const reviews = ref<Review[]>([]);
  const properties = ref<Property[]>([]);
  const currentReview = ref<Review | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const negativeReviews = computed(() =>
    reviews.value.filter(
      (r) => r.sentiment === "negative" || (r.rating !== undefined && r.rating < 4),
    ),
  );

  const pendingReviews = computed(() =>
    reviews.value.filter(
      (r) => r.status === "new" || r.status === "draft_ready",
    ),
  );

  const reviewsByProperty = computed(() => {
    const map = new Map<string, Review[]>();
    for (const review of reviews.value) {
      const existing = map.get(review.property_id);
      if (existing) {
        existing.push(review);
      } else {
        map.set(review.property_id, [review]);
      }
    }
    return map;
  });

  async function fetchProperties() {
    loading.value = true;
    error.value = null;

    try {
      properties.value = await api.getProperties();
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Ошибка загрузки объектов";
    } finally {
      loading.value = false;
    }
  }

  async function fetchReviews(params?: {
    propertyId?: string;
    status?: string;
    limit?: number;
  }) {
    loading.value = true;
    error.value = null;

    try {
      reviews.value = await api.getReviews(params);
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Ошибка загрузки отзывов";
    } finally {
      loading.value = false;
    }
  }

  async function fetchReview(id: string) {
    loading.value = true;
    error.value = null;

    try {
      currentReview.value = await api.getReview(id);
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Ошибка загрузки отзыва";
    } finally {
      loading.value = false;
    }
  }

  async function updateReview(id: string, data: Partial<Review>) {
    try {
      const updated = await api.updateReview(id, data);
      const index = reviews.value.findIndex((r) => r.id === id);
      if (index !== -1) {
        reviews.value[index] = updated;
      }
      if (currentReview.value?.id === id) {
        currentReview.value = updated;
      }
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Ошибка обновления отзыва";
      throw err;
    }
  }

  async function approveAppeal(reviewId: string) {
    await api.approveAppeal(reviewId);
    await fetchReview(reviewId);
  }

  async function rejectAppeal(reviewId: string) {
    await api.rejectAppeal(reviewId);
    await fetchReview(reviewId);
  }

  async function requestRevision(reviewId: string, feedback: string) {
    await api.requestRevision(reviewId, feedback);
    await fetchReview(reviewId);
  }

  return {
    reviews,
    properties,
    currentReview,
    loading,
    error,
    negativeReviews,
    pendingReviews,
    reviewsByProperty,
    fetchProperties,
    fetchReviews,
    fetchReview,
    updateReview,
    approveAppeal,
    rejectAppeal,
    requestRevision,
  };
});
