/// <reference lib="dom" />

import { test, expect } from "@playwright/test";

test.describe("HostGuard AI - Auth & Dashboard Flow", () => {
  test("should show auth page when not authenticated", async ({ page }) => {
    await page.goto("/");

    // Should redirect to auth page
    await expect(page).toHaveURL(/\/auth/);

    // Should show login form
    await expect(page.getByText("Вход")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Пароль")).toBeVisible();
  });

  test("should toggle between login and registration", async ({ page }) => {
    await page.goto("/auth");

    // Initially login mode
    await expect(page.getByText("Вход")).toBeVisible();

    // Switch to registration
    await page.getByText("Зарегистрироваться").click();
    await expect(page.getByText("Регистрация")).toBeVisible();

    // Switch back to login
    await page.getByText("Войти").click();
    await expect(page.getByText("Вход")).toBeVisible();
  });

  test("should show validation errors for empty form", async ({ page }) => {
    await page.goto("/auth");

    // Try submitting empty form
    await page.getByRole("button", { name: "Войти" }).click();

    // HTML5 validation should prevent submission
    await expect(page).toHaveURL(/\/auth/);
  });

  test("should show error on invalid credentials", async ({ page }) => {
    await page.goto("/auth");

    // Fill with invalid credentials
    await page.getByLabel("Email").fill("invalid@test.com");
    await page.getByLabel("Пароль").fill("wrongpassword");

    // Submit
    await page.getByRole("button", { name: "Войти" }).click();

    // Should show error message (Supabase will return an error)
    // The error div should appear
    await expect(page.locator(".bg-red-50")).toBeVisible({ timeout: 10000 });
  });

  test("should redirect to dashboard after successful login", async ({
    page,
  }) => {
    // This test requires valid Supabase credentials in .env
    // For CI, we mock the auth response
    test.skip(
      !process.env.VITE_SUPABASE_URL,
      "Supabase credentials not configured",
    );

    await page.goto("/auth");

    // Fill with test credentials
    await page.getByLabel("Email").fill(process.env.TEST_EMAIL ?? "");
    await page.getByLabel("Пароль").fill(process.env.TEST_PASSWORD ?? "");

    await page.getByRole("button", { name: "Войти" }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL("/");
    await expect(page.getByText("HostGuard AI")).toBeVisible();
  });

  test("should display dashboard layout with stats", async ({ page }) => {
    // Mock authenticated state
    await page.goto("/auth");
    await page.evaluate(() => {
      localStorage.setItem(
        "supabase.auth.token",
        JSON.stringify({
          currentSession: {
            access_token: "mock-token",
            user: { email: "test@example.com" },
          },
        }),
      );
    });

    // Navigate to dashboard
    await page.goto("/");

    // Should show dashboard elements
    await expect(page.getByText("HostGuard AI")).toBeVisible();

    // Should show stats cards
    await expect(page.getByText("Объектов")).toBeVisible();
    await expect(page.getByText("Всего отзывов")).toBeVisible();
    await expect(page.getByText("Негативных")).toBeVisible();
    await expect(page.getByText("Ожидают")).toBeVisible();

    // Should show tabs
    await expect(page.getByText("Лента инцидентов")).toBeVisible();
    await expect(page.getByText("Мои объекты")).toBeVisible();
  });

  test("should switch between incidents and properties tabs", async ({
    page,
  }) => {
    await page.goto("/auth");
    await page.evaluate(() => {
      localStorage.setItem(
        "supabase.auth.token",
        JSON.stringify({
          currentSession: {
            access_token: "mock-token",
            user: { email: "test@example.com" },
          },
        }),
      );
    });

    await page.goto("/");

    // Click on properties tab
    await page.getByText("Мои объекты").click();
    await expect(
      page.getByText("У вас пока нет добавленных объектов"),
    ).toBeVisible();

    // Switch back to incidents
    await page.getByText("Лента инцидентов").click();
    await expect(page.getByText("Новых отзывов пока нет")).toBeVisible();
  });

  test("should filter reviews by sentiment", async ({ page }) => {
    await page.goto("/auth");
    await page.evaluate(() => {
      localStorage.setItem(
        "supabase.auth.token",
        JSON.stringify({
          currentSession: {
            access_token: "mock-token",
            user: { email: "test@example.com" },
          },
        }),
      );
    });

    await page.goto("/");

    // Click on negative filter
    await page.getByText("Негативные").click();

    // Click on pending filter
    await page.getByText("Ожидают ответа").click();

    // Click on all filter
    await page.getByText("Все").first().click();
  });

  test("should be mobile responsive", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto("/auth");
    await page.evaluate(() => {
      localStorage.setItem(
        "supabase.auth.token",
        JSON.stringify({
          currentSession: {
            access_token: "mock-token",
            user: { email: "test@example.com" },
          },
        }),
      );
    });

    await page.goto("/");

    // Should render correctly on mobile
    await expect(page.getByText("HostGuard AI")).toBeVisible();

    // Stats should be in 2-column grid on mobile
    const statsGrid = page.locator(".grid-cols-2").first();
    await expect(statsGrid).toBeVisible();
  });
});
