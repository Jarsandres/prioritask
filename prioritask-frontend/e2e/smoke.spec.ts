import { test, expect } from "@playwright/test";

test.describe("Smoke Tests - Prioritask Web App", () => {
  test("debería redirigir de / a /login y renderizar la interfaz de autenticación", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/.*\/login/);

    // Verificar encabezado y formulario de inicio de sesión
    await expect(page.locator("h1, h2, .auth-title").first()).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("debería permitir alternar entre modo claro y oscuro", async ({ page }) => {
    await page.goto("/login");

    const themeBtn = page.locator('button[aria-label*="modo"]').first();
    await expect(themeBtn).toBeVisible();

    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    await themeBtn.click();
    const newTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));

    expect(newTheme).not.toEqual(initialTheme);
  });
});
