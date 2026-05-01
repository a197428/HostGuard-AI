<script setup lang="ts">
import type { Review } from "@shared/types";
import ReviewCard from "./ReviewCard.vue";
import SkeletonLoader from "@/components/ui/SkeletonLoader.vue";

const props = defineProps<{
  reviews: Review[];
  loading: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  reviewClick: [id: string];
}>();
</script>

<template>
  <div class="space-y-3">
    <!-- Error State -->
    <div
      v-if="error"
      class="card p-4 text-center text-red-600 text-sm"
    >
      {{ error }}
    </div>

    <!-- Loading State -->
    <div v-if="loading && reviews.length === 0">
      <SkeletonLoader :lines="4" />
      <SkeletonLoader :lines="4" />
      <SkeletonLoader :lines="4" />
    </div>

    <!-- Empty State -->
    <div
      v-if="!loading && reviews.length === 0 && !error"
      class="card p-8 text-center"
    >
      <div class="text-gray-400 text-4xl mb-2">📭</div>
      <p class="text-gray-500 text-sm">Новых отзывов пока нет</p>
    </div>

    <!-- Review List -->
    <ReviewCard
      v-for="review in reviews"
      :key="review.id"
      :review="review"
      @click="emit('reviewClick', review.id)"
    />
  </div>
</template>
