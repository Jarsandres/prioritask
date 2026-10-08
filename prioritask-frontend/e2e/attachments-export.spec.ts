import { test, expect } from "@playwright/test";

test.describe("Sprint 10 E2E - Exportación GDPR y Gestión de Adjuntos", () => {
  test.beforeEach(async ({ page }) => {
    // Interceptar autenticación y perfil de usuario
    await page.route("**/api/v1/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "usr-sprint10",
          nombre: "Usuario QA Test",
          email: "qa@prioritask.app",
        }),
      });
    });

    // Interceptar lista de salas/hogares
    await page.route("**/api/v1/rooms", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "room-s10-xyz",
            nombre: "Casa de Pruebas",
            is_owner: true,
            my_role: "ADMIN",
            members: [],
          },
        ]),
      });
    });

    // Interceptar detalle de la sala
    await page.route("**/api/v1/rooms/room-s10-xyz", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "room-s10-xyz",
          nombre: "Casa de Pruebas",
          owner_id: "usr-sprint10",
          created_at: new Date().toISOString(),
          members: [
            {
              user_id: "usr-sprint10",
              nombre: "Usuario QA Test",
              email: "qa@prioritask.app",
              role: "ADMIN",
            },
          ],
        }),
      });
    });

    // Interceptar miembros de la sala
    await page.route("**/api/v1/rooms/room-s10-xyz/members", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            user_id: "usr-sprint10",
            nombre: "Usuario QA Test",
            email: "qa@prioritask.app",
            role: "ADMIN",
          },
        ]),
      });
    });

    // Interceptar lista de tareas de la sala
    await page.route("**/api/v1/rooms/room-s10-xyz/tasks**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "task-s10-01",
            titulo: "Reparar persiana del salón",
            descripcion: "Cambiar la cinta rota y engrasar los rodillos",
            categoria: "MANTENIMIENTO",
            estado: "PENDING",
            peso: 2.0,
            completed: false,
            room_id: "room-s10-xyz",
            user_id: "usr-sprint10",
            created_at: new Date().toISOString(),
            subtasks: [],
            comments: [],
            attachments_count: 2,
          },
        ]),
      });
    });

    // Inyectar credenciales activas en localStorage
    await page.addInitScript(() => {
      localStorage.setItem("token", "fake-jwt-token-sprint10");
      localStorage.setItem("refreshToken", "fake-refresh-token-sprint10");
      localStorage.setItem("roomId", "room-s10-xyz");
    });
  });

  test("debería abrir el modal de exportación GDPR, ofrecer descarga JSON/CSV e impresión para la nevera", async ({
    page,
  }) => {
    // Interceptar endpoint de exportación
    await page.route("**/api/v1/rooms/room-s10-xyz/export**", async (route) => {
      const url = new URL(route.request().url());
      const format = url.searchParams.get("format") || "json";

      if (format === "csv") {
        await route.fulfill({
          status: 200,
          contentType: "text/csv; charset=utf-8",
          headers: {
            "Content-Disposition": 'attachment; filename="prioritask_room.csv"',
          },
          body: "ID tarea,Título,Categoría\ntask-s10-01,Reparar persiana,MANTENIMIENTO\n",
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "Content-Disposition": 'attachment; filename="prioritask_room.json"',
          },
          body: JSON.stringify({
            room: { id: "room-s10-xyz", nombre: "Casa de Pruebas" },
            tasks: [{ id: "task-s10-01", titulo: "Reparar persiana" }],
          }),
        });
      }
    });

    await page.goto("/rooms/room-s10-xyz/tasks");

    // Verificar que estamos en la sala correcta
    await expect(page.locator(".header-room-name")).toContainText("Casa de Pruebas");

    // Buscar y pulsar el botón de Exportar / Imprimir
    const exportBtn = page.locator('button:has-text("Exportar / Imprimir"), button[title*="Exportar datos del hogar"]').first();
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    // El modal de exportación debe ser visible
    const modalTitle = page.locator("#export-modal-title");
    await expect(modalTitle).toBeVisible();
    await expect(modalTitle).toContainText("Exportar Datos y Lista de Tareas");

    // Validar las 3 opciones principales
    await expect(page.locator("text=Imprimir Lista para la Nevera (A4)")).toBeVisible();
    await expect(page.locator("text=Respaldo Total (JSON)")).toBeVisible();
    await expect(page.locator("text=Hojas de Cálculo (CSV)")).toBeVisible();

    // Probar click en Descargar JSON
    const downloadJsonBtn = page.locator('button:has-text("Descargar JSON")');
    await expect(downloadJsonBtn).toBeVisible();
    await downloadJsonBtn.click();

    // Probar click en Descargar CSV
    const downloadCsvBtn = page.locator('button:has-text("Descargar CSV")');
    await expect(downloadCsvBtn).toBeVisible();
    await downloadCsvBtn.click();

    // Cerrar el modal con el botón de cruz
    const closeBtn = page.locator('button[aria-label="Cerrar modal"]');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Confirmar que el modal ya no es visible
    await expect(modalTitle).not.toBeVisible();
  });

  test("debería desplegar la sección de adjuntos de la tarea y abrir el visor Lightbox retro", async ({
    page,
  }) => {
    // Interceptar lista de adjuntos de la tarea
    await page.route("**/api/v1/tasks/task-s10-01/attachments", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "att-img-01",
            task_id: "task-s10-01",
            user_id: "usr-sprint10",
            filename: "foto_persiana_rota.png",
            content_type: "image/png",
            file_size_bytes: 45056,
            caption: "Estado antes de la reparación",
            download_url: "/api/v1/tasks/task-s10-01/attachments/att-img-01/download",
            created_at: new Date().toISOString(),
          },
          {
            id: "att-pdf-02",
            task_id: "task-s10-01",
            user_id: "usr-sprint10",
            filename: "manual_instalacion.pdf",
            content_type: "application/pdf",
            file_size_bytes: 120400,
            caption: "Instrucciones del fabricante",
            download_url: "/api/v1/tasks/task-s10-01/attachments/att-pdf-02/download",
            created_at: new Date().toISOString(),
          },
        ]),
      });
    });

    // Interceptar descarga/stream del binario de imagen para miniatura y lightbox
    const dummyPngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    await page.route("**/api/v1/tasks/task-s10-01/attachments/att-img-01/download", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: {
          "Content-Disposition": 'attachment; filename="foto_persiana_rota.png"',
          "X-Content-Type-Options": "nosniff",
        },
        body: dummyPngBytes,
      });
    });

    await page.goto("/rooms/room-s10-xyz/tasks");

    // Verificar que la tarea está renderizada
    await expect(page.locator("text=Reparar persiana del salón").first()).toBeVisible();

    // Abrir sección de adjuntos pulsando el badge de adjuntos
    const attachmentsBadge = page.locator(".ui-task-attachments-badge").first();
    await expect(attachmentsBadge).toBeVisible();
    await attachmentsBadge.click();

    // La sección de adjuntos debe mostrarse
    const attachmentsSection = page.locator(".retro-attachments-section");
    await expect(attachmentsSection).toBeVisible();
    await expect(attachmentsSection.locator("text=Evidencias y Adjuntos")).toBeVisible();

    // Verificar que se listan los 2 archivos
    await expect(attachmentsSection.locator("text=foto_persiana_rota.png")).toBeVisible();
    await expect(attachmentsSection.locator("text=manual_instalacion.pdf")).toBeVisible();
    await expect(attachmentsSection.locator(".retro-thumb-pdf")).toBeVisible();

    // Verificar controles de Dropzone: Adjuntar Archivo y Cámara Móvil
    await expect(page.locator('button:has-text("Adjuntar Archivo")')).toBeVisible();
    await expect(page.locator('button:has-text("Cámara Móvil")')).toBeVisible();

    // Hacer clic en la miniatura de la imagen para abrir el Lightbox retro
    const imgThumb = attachmentsSection.locator(".retro-attachment-thumb").first();
    await imgThumb.click();

    // El Lightbox Modal debe ser visible
    const lightboxContainer = page.locator(".retro-lightbox-container");
    await expect(lightboxContainer).toBeVisible();
    await expect(lightboxContainer.locator(".retro-lightbox-title")).toContainText("foto_persiana_rota.png");

    // Controles de zoom y rotación deben estar disponibles
    await expect(page.locator('button[title*="Acercar"]').first()).toBeVisible();
    await expect(page.locator('button[title*="Rotar"]').first()).toBeVisible();

    // Cerrar el Lightbox con Escape
    await page.keyboard.press("Escape");
    await expect(lightboxContainer).not.toBeVisible();
  });
});
