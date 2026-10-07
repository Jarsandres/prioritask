import { test, expect } from "@playwright/test";

test.describe("E2E - Command Palette y Atajos de Teclado", () => {
  test("debería abrir y cerrar la Paleta de Comandos con atajos de teclado (Ctrl+K / Esc)", async ({
    page,
  }) => {
    await page.goto("/login");

    // Verificar que inicialmente el modal de comando no está visible
    const paletteModal = page.locator(".command-palette-container");
    await expect(paletteModal).not.toBeVisible();

    // Presionar Ctrl+K para abrir
    await page.keyboard.press("Control+k");
    await expect(paletteModal).toBeVisible();

    // El input debe tener el foco y mostrar el placeholder esperado
    const searchInput = page.locator(".command-palette-input");
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeFocused();
    await expect(searchInput).toHaveAttribute(
      "placeholder",
      "Buscar tareas, cambiar de hogar o ejecutar acción..."
    );

    // Presionar Escape para cerrar el modal
    await page.keyboard.press("Escape");
    await expect(paletteModal).not.toBeVisible();
  });

  test("debería abrir y cerrar la ventana de Atajos de Teclado con '?' y 'Esc'", async ({
    page,
  }) => {
    await page.goto("/login");

    // Asegurarse de no estar enfocado en un campo de texto
    await page.locator("body").click({ position: { x: 5, y: 5 } });

    // Presionar ? para abrir modal de atajos
    await page.keyboard.press("?");

    const shortcutsModal = page.locator(".modal-backdrop-custom");
    await expect(shortcutsModal).toBeVisible();
    await expect(shortcutsModal).toContainText("Atajos de Teclado");
    await expect(shortcutsModal).toContainText("Ctrl");
    await expect(shortcutsModal).toContainText("K");

    // Cerrar con Escape
    await page.keyboard.press("Escape");
    await expect(shortcutsModal).not.toBeVisible();
  });

  test("debería interactuar con la Command Palette en vista autenticada y buscar tareas", async ({
    page,
  }) => {
    // Interceptar llamadas al API para simular sesión iniciada
    await page.route("**/api/v1/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "usr-123",
          nombre: "Usuario Demo",
          email: "demo@prioritask.app",
        }),
      });
    });

    await page.route("**/api/v1/rooms", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "room-abc-123",
            nombre: "Casa Principal",
            is_owner: true,
            my_role: "ADMIN",
            members: [],
          },
        ]),
      });
    });

    await page.route("**/api/v1/rooms/room-abc-123/tasks**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route("**/api/v1/tasks/search**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total_matches: 1,
          results: [
            {
              task: {
                id: "task-001",
                titulo: "Comprar suministros para oficina",
                estado: "PENDING",
                categoria: "COMPRA",
                prioridad: "ALTA",
                created_at: new Date().toISOString(),
              },
              relevance_score: 4.5,
              matched_fields: ["titulo"],
            },
          ],
        }),
      });
    });

    // Inyectar credenciales en localStorage antes de cargar la página
    await page.addInitScript(() => {
      localStorage.setItem("token", "fake-jwt-token-for-e2e");
      localStorage.setItem("refreshToken", "fake-refresh-token");
      localStorage.setItem("roomId", "room-abc-123");
    });

    await page.goto("/dashboard");

    // Verificar que el Header se renderizó con el nombre del hogar
    await expect(page.locator(".header-room-name")).toContainText("Casa Principal");

    // Abrir Command Palette pulsando el botón de búsqueda en el Header
    const searchHeaderBtn = page.locator(".header-search-btn");
    await expect(searchHeaderBtn).toBeVisible();
    await searchHeaderBtn.click();

    const paletteModal = page.locator(".command-palette-container");
    await expect(paletteModal).toBeVisible();

    // Escribir en el buscador
    const searchInput = page.locator(".command-palette-input");
    await searchInput.fill("suministros");

    // Esperar a que los resultados de búsqueda se muestren
    await expect(page.locator(".command-palette-item-title").first()).toContainText(
      "Comprar suministros para oficina"
    );

    // Navegar con teclas de flecha y presionar Escape
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(paletteModal).not.toBeVisible();

    // Abrir atajos de teclado desde el botón de la cabecera
    const shortcutsBtn = page.locator('button[aria-label="Ver atajos de teclado (?)"]');
    if (await shortcutsBtn.isVisible()) {
      await shortcutsBtn.click();
      const shortcutsModal = page.locator(".modal-backdrop-custom");
      await expect(shortcutsModal).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(shortcutsModal).not.toBeVisible();
    }
  });
});
