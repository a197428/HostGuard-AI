<script setup lang="ts">
import type { Property } from "@shared/types";

const props = defineProps<{
  property: Property;
  reviewCount?: number;
  negativeCount?: number;
}>();

const emit = defineEmits<{
  click: [id: string];
}>();
</script>

<template>
  <div
    class="card p-4 cursor-pointer hover:shadow-md transition-shadow"
    @click="emit('click', property.id)"
  >
    <div class="flex items-start justify-between mb-2">
      <div>
        <h3 class="font-semibold text-gray-900">
          {{ property.name }}
        </h3>
        <p v-if="property.address" class="text-xs text-gray-500 mt-0.5">
          {{ property.address }}
        </p>
      </div>
      <div
        class="w-2 h-2 rounded-full"
        :class="
          property.is_monitoring_active ? 'bg-green-500' : 'bg-gray-300'
        "
        :title="
          property.is_monitoring_active
            ? 'Мониторинг активен'
            : 'Мониторинг приостановлен'
        "
      />
    </div>

    <div class="flex items-center gap-4 text-xs text-gray-500 mt-3">
      <span>Отзывов: {{ reviewCount ?? 0 }}</span>
      <span v-if="(negativeCount ?? 0) > 0" class="text-red-600 font-medium">
        Негативных: {{ negativeCount }}
      </span>
      <span>
        Интервал: {{ property.monitoring_interval }} мин
      </span>
    </div>
  </div>
</template>
