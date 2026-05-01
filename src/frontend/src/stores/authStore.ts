import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => user.value !== null);

  async function initialize() {
    const { data } = await supabase.auth.getSession();
    user.value = data.session?.user ?? null;

    supabase.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user ?? null;
    });
  }

  async function signIn(email: string, password: string) {
    loading.value = true;
    error.value = null;

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;
      user.value = data.user;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Ошибка входа";
      error.value = message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function signUp(email: string, password: string) {
    loading.value = true;
    error.value = null;

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;
      user.value = data.user;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Ошибка регистрации";
      error.value = message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    user.value = null;
  }

  return {
    user,
    loading,
    error,
    isAuthenticated,
    initialize,
    signIn,
    signUp,
    signOut,
  };
});
