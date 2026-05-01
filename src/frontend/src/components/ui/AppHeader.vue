<script setup lang="ts">
import { useAuthStore } from "@/stores/authStore";

const authStore = useAuthStore();
</script>

<template>
  <header class="sticky top-0 z-40 bg-white border-b border-gray-200">
    <div class="flex items-center justify-between px-4 h-14 max-w-7xl mx-auto">
      <div class="flex items-center gap-3">
        <router-link to="/" class="flex items-center gap-2">
          <div
            class="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm"
          >
            HG
          </div>
          <span class="font-semibold text-gray-900 hidden sm:inline">
            HostGuard AI
          </span>
        </router-link>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-500 hidden sm:inline">
          {{ authStore.user?.email }}
        </span>
        <button class="btn-ghost text-sm" @click="authStore.signOut()">
          Выйти
        </button>
      </div>
    </div>
  </header>
</template>
