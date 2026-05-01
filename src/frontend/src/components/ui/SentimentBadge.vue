<script setup lang="ts">
import type { Sentiment } from "@shared/types";

const props = defineProps<{
  sentiment?: Sentiment | null;
  rating?: number | null;
}>();

const labelMap: Record<string, string> = {
  positive: "Позитивный",
  neutral: "Нейтральный",
  negative: "Негативный",
};

function getBadgeClass(): string {
  if (
    props.sentiment === "negative" ||
    (props.rating !== undefined && props.rating !== null && props.rating < 4)
  ) {
    return "badge-negative";
  }
  if (
    props.sentiment === "positive" ||
    (props.rating !== undefined && props.rating !== null && props.rating >= 4)
  ) {
    return "badge-positive";
  }
  return "badge-neutral";
}

function getLabel(): string {
  if (props.sentiment) {
    return labelMap[props.sentiment] ?? "Неизвестно";
  }
  if (props.rating !== undefined && props.rating !== null) {
    return `Рейтинг: ${props.rating}/5`;
  }
  return "Неизвестно";
}
</script>

<template>
  <span :class="getBadgeClass()">
    {{ getLabel() }}
  </span>
</template>
