<script setup lang="ts">
import type { Review } from "@shared/types";
import SentimentBadge from "@/components/ui/SentimentBadge.vue";
import PlatformIcon from "@/components/ui/PlatformIcon.vue";

const props = defineProps<{
  review: Review;
}>();

const emit = defineEmits<{
  click: [id: string];
}>();

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateText(text: string, maxLength = 120): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

const statusLabels: Record<string, string> = {
  new: "Новый",
  draft_ready: "Черновик готов",
  approved: "Одобрен",
  edited: "Отредактирован",
  rejected: "Отклонён",
  appeal_sent: "Апелляция отправлена",
  appeal_success: "Апелляция успешна",
  appeal_denied: "В апелляции отказано",
};
</script>

<template>
  <div
    class="card p-4 cursor-pointer hover:shadow-md transition-shadow"
    @click="emit('click', review.id)"
  >
    <div class="flex items-start justify-between mb-2">
      <div class="flex items-center gap-2">
        <PlatformIcon :platform="review.platform" />
        <span class="text-xs text-gray-400">
          {{ formatDate(review.created_at) }}
        </span>
      </div>
      <SentimentBadge :sentiment="review.sentiment" :rating="review.rating" />
    </div>

    <p class="text-sm text-gray-700 mb-2">
      {{ truncateText(review.text) }}
    </p>

    <div class="flex items-center justify-between">
      <span class="text-xs text-gray-400">
        Рейтинг: {{ review.rating }}/5
      </span>
      <span
        class="text-xs px-2 py-0.5 rounded-full"
        :class="{
          'bg-blue-100 text-blue-700': review.status === 'new',
          'bg-yellow-100 text-yellow-700': review.status === 'draft_ready',
          'bg-green-100 text-green-700': review.status === 'approved',
          'bg-gray-100 text-gray-500': review.status === 'rejected',
        }"
      >
        {{ statusLabels[review.status] ?? review.status }}
      </span>
    </div>
  </div>
</template>
