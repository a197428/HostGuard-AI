<script setup lang="ts">
import { onMounted } from "vue";
import { useAuthStore } from "@/stores/authStore";

const authStore = useAuthStore();

onMounted(() => {
  authStore.initialize();
});
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <router-view />
  </div>
</template>
