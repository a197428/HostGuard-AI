<script setup lang="ts">
import type { Platform } from "@shared/types";

const props = defineProps<{
  platform: Platform;
}>();

const platformNames: Record<Platform, string> = {
  avito: "Avito",
  ostrovok: "Островок.ру",
  yandex: "Яндекс Путешествия",
};

const platformColors: Record<Platform, string> = {
  avito: "text-blue-600",
  ostrovok: "text-green-600",
  yandex: "text-yellow-600",
};
</script>

<template>
  <span :class="platformColors[platform]" class="font-medium text-sm">
    {{ platformNames[platform] }}
  </span>
</template>
