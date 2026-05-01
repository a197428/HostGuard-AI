<script setup lang="ts">
import { onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useReviewStore } from "@/stores/reviewStore";
import AppHeader from "@/components/ui/AppHeader.vue";
import PropertyCard from "@/components/reviews/PropertyCard.vue";
import ReviewList from "@/components/reviews/ReviewList.vue";

const router = useRouter();
const store = useReviewStore();

const activeTab = ref<"incidents" | "properties">("incidents");
const filterStatus = ref<string>("all");

import { ref } from "vue";

onMounted(async () => {
  await Promise.all([store.fetchProperties(), store.fetchReviews()]);
});

const filteredReviews = computed(() => {
  if (filterStatus.value === "all") return store.reviews;
  if (filterStatus.value === "negative") return store.negativeReviews;
  if (filterStatus.value === "pending") return store.pendingReviews;
  return store.reviews;
});

const stats = computed(() => ({
  total: store.reviews.length,
  negative: store.negativeReviews.length,
  pending: store.pendingReviews.length,
  properties: store.properties.length,
}));

function goToProperty(id: string) {
  router.push(`/property/${id}`);
}

function goToReview(id: string) {
  router.push(`/review/${id}`);
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <AppHeader />

    <main class="max-w-7xl mx-auto px-4 py-6">
      <!-- Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div class="card p-3 text-center">
          <div class="text-2xl font-bold text-gray-900">
            {{ stats.properties }}
          </div>
          <div class="text-xs text-gray-500">Объектов</div>
        </div>
        <div class="card p-3 text-center">
          <div class="text-2xl font-bold text-gray-900">
            {{ stats.total }}
          </div>
          <div class="text-xs text-gray-500">Всего отзывов</div>
        </div>
        <div class="card p-3 text-center">
          <div class="text-2xl font-bold text-red-600">
            {{ stats.negative }}
          </div>
          <div class="text-xs text-gray-500">Негативных</div>
        </div>
        <div class="card p-3 text-center">
          <div class="text-2xl font-bold text-amber-600">
            {{ stats.pending }}
          </div>
          <div class="text-xs text-gray-500">Ожидают</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        <button
          class="flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors"
          :class="
            activeTab === 'incidents'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          "
          @click="activeTab = 'incidents'"
        >
          Лента инцидентов
        </button>
        <button
          class="flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors"
          :class="
            activeTab === 'properties'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          "
          @click="activeTab = 'properties'"
        >
          Мои объекты
        </button>
      </div>

      <!-- Incidents Tab -->
      <div v-if="activeTab === 'incidents'">
        <!-- Filter -->
        <div class="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap"
            :class="
              filterStatus === 'all'
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            "
            @click="filterStatus = 'all'"
          >
            Все
          </button>
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap"
            :class="
              filterStatus === 'negative'
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            "
            @click="filterStatus = 'negative'"
          >
            Негативные
          </button>
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap"
            :class="
              filterStatus === 'pending'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            "
            @click="filterStatus = 'pending'"
          >
            Ожидают ответа
          </button>
        </div>

        <ReviewList
          :reviews="filteredReviews"
          :loading="store.loading"
          :error="store.error"
          @review-click="goToReview"
        />
      </div>

      <!-- Properties Tab -->
      <div v-if="activeTab === 'properties'" class="space-y-3">
        <div v-if="store.loading && store.properties.length === 0">
          <div class="skeleton h-20 rounded-xl" />
          <div class="skeleton h-20 rounded-xl mt-3" />
        </div>

        <div
          v-if="!store.loading && store.properties.length === 0"
          class="card p-8 text-center"
        >
          <div class="text-gray-400 text-4xl mb-2">🏠</div>
          <p class="text-gray-500 text-sm">
            У вас пока нет добавленных объектов
          </p>
        </div>

        <PropertyCard
          v-for="property in store.properties"
          :key="property.id"
          :property="property"
          :review-count="store.reviewsByProperty.get(property.id)?.length ?? 0"
          :negative-count="
            store.reviewsByProperty
              .get(property.id)
              ?.filter((r) => r.sentiment === 'negative' || r.rating < 4).length ?? 0
          "
          @click="goToProperty"
        />
      </div>
    </main>
  </div>
</template>
