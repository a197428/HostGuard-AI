<script setup lang="ts">
defineProps<{
  lines?: number;
}>();

const defaultLines = 3;
</script>

<template>
  <div class="space-y-3 p-4">
    <div
      v-for="i in (lines ?? defaultLines)"
      :key="i"
      class="skeleton h-4"
      :style="{ width: `${80 - i * 10}%` }"
    />
  </div>
</template>
