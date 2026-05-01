<script setup lang="ts">
import { onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useReviewStore } from "@/stores/reviewStore";
import AppHeader from "@/components/ui/AppHeader.vue";
import SentimentBadge from "@/components/ui/SentimentBadge.vue";
import PlatformIcon from "@/components/ui/PlatformIcon.vue";
import AppealEditor from "@/components/reviews/AppealEditor.vue";

const route = useRoute();
const router = useRouter();
const store = useReviewStore();

const reviewId = route.params.id as string;

const review = computed(() => store.currentReview.value);

onMounted(async () => {
  await store.fetchReview(reviewId);
});

function goBack() {
  router.push("/");
}

async function handleApprove(payload: {
  reviewId: string;
  status: "approved" | "appeal_sent";
  public_response_edited?: string;
  appeal_text?: string;
  appeal_confidence?: number;
  legal_grounds?: unknown[];
}) {
  try {
    await store.updateReview(payload.reviewId, {
      status: payload.status,
      public_response_edited: payload.public_response_edited,
      appeal_text: payload.appeal_text,
      appeal_confidence: payload.appeal_confidence,
      legal_grounds: payload.legal_grounds,
    });
  } catch {
    // Error is handled in store
  }
}

async function handleReject(payload: {
  reviewId: string;
  status: "rejected";
  public_response_edited?: string;
  appeal_text?: string;
  appeal_confidence?: number;
  legal_grounds?: unknown[];
}) {
  try {
    await store.updateReview(payload.reviewId, {
      status: payload.status,
      public_response_edited: payload.public_response_edited,
      appeal_text: payload.appeal_text,
      appeal_confidence: payload.appeal_confidence,
      legal_grounds: payload.legal_grounds,
    });
  } catch {
    // Error is handled in store
  }
}

async function handleRequestRevision(payload: {
  reviewId: string;
  status: "draft_ready" | "edited";
  public_response_edited?: string;
  appeal_text?: string;
  appeal_confidence?: number;
  legal_grounds?: unknown[];
  feedback: string;
}) {
  try {
    await store.updateReview(payload.reviewId, {
      status: payload.status,
      public_response_edited: payload.public_response_edited,
      appeal_text: payload.appeal_text,
      appeal_confidence: payload.appeal_confidence,
      legal_grounds: payload.legal_grounds,
    });
  } catch {
    // Error is handled in store
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <AppHeader />

    <main class="max-w-3xl mx-auto px-4 py-6">
      <!-- Back Button -->
      <button class="btn-ghost mb-4 text-sm" @click="goBack">
        ← Назад к дашборду
      </button>

      <!-- Loading -->
      <div v-if="store.loading && !review" class="space-y-4">
        <div class="skeleton h-8 w-2/3" />
        <div class="skeleton h-32" />
        <div class="skeleton h-48" />
      </div>

      <!-- Error -->
      <div
        v-if="!store.loading && !review && store.error"
        class="card p-8 text-center"
      >
        <p class="text-red-600 text-sm">{{ store.error }}</p>
      </div>

      <!-- Review Detail -->
      <template v-if="review">
        <!-- Review Header -->
        <div class="card p-4 mb-4">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2">
              <PlatformIcon :platform="review.platform" />
              <span class="text-sm text-gray-500">
                {{ formatDate(review.created_at) }}
              </span>
            </div>
            <SentimentBadge
              :sentiment="review.sentiment"
              :rating="review.rating"
            />
          </div>

          <div class="flex items-center gap-2 mb-3">
            <span class="text-sm text-gray-500">Рейтинг:</span>
            <div class="flex items-center gap-0.5">
              <span
                v-for="star in 5"
                :key="star"
                class="text-lg"
                :class="
                  star <= review.rating ? 'text-yellow-400' : 'text-gray-200'
                "
              >
                ★
              </span>
            </div>
          </div>

          <p class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {{ review.text }}
          </p>

          <div class="mt-3 text-xs text-gray-400">
            Статус: {{ review.status }}
          </div>
        </div>

        <!-- Appeal Editor -->
        <AppealEditor
          :review="review"
          @approve="handleApprove"
          @reject="handleReject"
          @request-revision="handleRequestRevision"
        />
      </template>
    </main>
  </div>
</template>
