<script setup lang="ts">
const props = defineProps<{
  confidence: number;
}>();

const confidencePercent = computed(() => Math.round(props.confidence * 100));

const barColor = computed(() => {
  if (props.confidence >= 0.8) return "bg-green-500";
  if (props.confidence >= 0.6) return "bg-yellow-500";
  return "bg-red-500";
});

const label = computed(() => {
  if (props.confidence >= 0.8) return "Высокая уверенность";
  if (props.confidence >= 0.6) return "Средняя уверенность";
  return "Низкая уверенность";
});

import { computed } from "vue";
</script>

<template>
  <div class="flex items-center gap-2">
    <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
      <div
        :class="barColor"
        class="h-full rounded-full transition-all duration-300"
        :style="{ width: `${confidencePercent}%` }"
      />
    </div>
    <span class="text-xs text-gray-500 whitespace-nowrap">
      {{ confidencePercent }}%
    </span>
    <span
      v-if="confidence < 0.7"
      class="text-xs text-amber-600 font-medium"
    >
      Рекомендуется ручная проверка
    </span>
  </div>
</template>
