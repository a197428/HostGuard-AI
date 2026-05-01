<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/authStore";

const router = useRouter();
const authStore = useAuthStore();

const isLogin = ref(true);
const email = ref("");
const password = ref("");
const localError = ref<string | null>(null);
const submitting = ref(false);

async function handleSubmit() {
  localError.value = null;
  submitting.value = true;

  try {
    if (isLogin.value) {
      await authStore.signIn(email.value, password.value);
    } else {
      await authStore.signUp(email.value, password.value);
    }
    router.push("/");
  } catch (err) {
    localError.value = err instanceof Error ? err.message : "Произошла ошибка";
  } finally {
    submitting.value = false;
  }
}

function toggleMode() {
  isLogin.value = !isLogin.value;
  localError.value = null;
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div
          class="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold text-lg mx-auto mb-3"
        >
          HG
        </div>
        <h1 class="text-xl font-bold text-gray-900">HostGuard AI</h1>
        <p class="text-sm text-gray-500 mt-1">
          Мониторинг и защита онлайн-репутации
        </p>
      </div>

      <!-- Form -->
      <form class="card p-6 space-y-4" @submit.prevent="handleSubmit">
        <h2 class="text-lg font-semibold text-gray-900 text-center">
          {{ isLogin ? "Вход" : "Регистрация" }}
        </h2>

        <!-- Error -->
        <div
          v-if="localError || authStore.error"
          class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3"
        >
          {{ localError ?? authStore.error }}
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700" for="email">
            Email
          </label>
          <input
            id="email"
            v-model="email"
            type="email"
            class="input"
            placeholder="your@email.com"
            required
            autocomplete="email"
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700" for="password">
            Пароль
          </label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="input"
            placeholder="••••••••"
            required
            minlength="6"
            autocomplete="current-password"
          />
        </div>

        <button type="submit" class="btn-primary w-full" :disabled="submitting">
          {{
            submitting
              ? "Загрузка..."
              : isLogin
                ? "Войти"
                : "Зарегистрироваться"
          }}
        </button>

        <p class="text-center text-sm text-gray-500">
          {{ isLogin ? "Нет аккаунта?" : "Уже есть аккаунт?" }}
          <button
            type="button"
            class="text-brand-600 font-medium hover:underline"
            @click="toggleMode"
          >
            {{ isLogin ? "Зарегистрироваться" : "Войти" }}
          </button>
        </p>
      </form>
    </div>
  </div>
</template>
