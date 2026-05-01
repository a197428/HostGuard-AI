<script setup lang="ts">
import { onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useReviewStore } from "@/stores/reviewStore";
import AppHeader from "@/components/ui/AppHeader.vue";
import ReviewList from "@/components/reviews/ReviewList.vue";

const route = useRoute();
const router = useRouter();
const store = useReviewStore();

const propertyId = route.params.id as string;

const property = computed(() =>
  store.properties.find((p) => p.id === propertyId),
);

const propertyReviews = computed(() =>
  store.reviews.filter((r) => r.property_id === propertyId),
);

onMounted(async () => {
  if (store.properties.length === 0) {
    await store.fetchProperties();
  }
  await store.fetchReviews({ propertyId });
});

function goToReview(id: string) {
  router.push(`/review/${id}`);
}

function goBack() {
  router.push("/");
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <AppHeader />

    <main class="max-w-7xl mx-auto px-4 py-6">
      <!-- Back Button -->
      <button class="btn-ghost mb-4 text-sm" @click="goBack">
        ← Назад к дашборду
      </button>

      <!-- Property Info -->
      <div v-if="property" class="card p-4 mb-6">
        <h1 class="text-lg font-bold text-gray-900">
          {{ property.name }}
        </h1>
        <p v-if="property.address" class="text-sm text-gray-500 mt-1">
          {{ property.address }}
        </p>
        <div class="flex items-center gap-4 mt-3 text-sm text-gray-500">
          <span>Отзывов: {{ propertyReviews.length }}</span>
          <span>
            Мониторинг:
            {{ property.is_monitoring_active ? "Активен" : "Приостановлен" }}
          </span>
          <span>Интервал: {{ property.monitoring_interval }} мин</span>
        </div>
      </div>

      <div v-else class="card p-8 text-center">
        <p class="text-gray-500">Объект не найден</p>
      </div>

      <!-- Reviews -->
      <h2 class="text-base font-semibold text-gray-900 mb-3">
        Отзывы
      </h2>
      <ReviewList
        :reviews="propertyReviews"
        :loading="store.loading"
        :error="store.error"
        @review-click="goToReview"
      />
    </main>
  </div>
</template>
