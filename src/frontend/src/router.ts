import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/authStore";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "dashboard",
      component: () => import("./views/Dashboard.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/property/:id",
      name: "property",
      component: () => import("./views/Property.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/review/:id",
      name: "review",
      component: () => import("./views/ReviewDetail.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/auth",
      name: "auth",
      component: () => import("./views/Auth.vue"),
    },
  ],
});

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: "auth" });
  } else if (to.name === "auth" && authStore.isAuthenticated) {
    next({ name: "dashboard" });
  } else {
    next();
  }
});

export default router;
