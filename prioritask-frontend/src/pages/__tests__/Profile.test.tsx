import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Profile from "../Profile";
import Sidebar from "../../components/Sidebar";
import { ThemeProvider } from "../../context/ThemeContext";
import { SettingsProvider } from "../../context/SettingsContext";
import { ToastProvider } from "../../context/ToastContext";
import { RoomContext, type RoomContextType } from "../../context/RoomContext";
import api from "../../api";

vi.mock("../../api", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

const mockRooms = [
  { id: "room-1", nombre: "Cocina Principal", count: 4 },
  { id: "room-2", nombre: "Terraza Jardín", count: 2 },
];

const mockRoomContextValue: RoomContextType = {
  roomId: "room-1",
  setRoomId: vi.fn(),
  rooms: mockRooms,
  activeRoom: mockRooms[0],
  selectRoom: vi.fn(),
  refreshRooms: vi.fn().mockResolvedValue(undefined),
  loadingRooms: false,
};

const renderSettingsWorkspace = (withSidebar = false) => {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <ThemeProvider>
        <SettingsProvider>
          <ToastProvider>
            <RoomContext.Provider value={mockRoomContextValue}>
              {withSidebar && <Sidebar isOpen={true} />}
              <Profile />
            </RoomContext.Provider>
          </ToastProvider>
        </SettingsProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
};

describe("Profile Settings Workspace & Profile Center (v1.8.0)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "mock-jwt-token");
    vi.clearAllMocks();

    vi.mocked(api.get).mockResolvedValue({
      data: {
        id: "usr-001",
        nombre: "Ana García",
        email: "ana@prioritask.dev",
        preferences: {},
      },
    });
  });

  it("renderiza las 7 secciones del Settings Workspace y preserva intacto el Theme Studio", async () => {
    renderSettingsWorkspace();

    await waitFor(() => {
      expect(screen.getByTestId("settings-section-account")).toBeInTheDocument();
    });

    expect(screen.getByTestId("settings-section-general")).toBeInTheDocument();
    expect(
      screen.getByTestId("settings-section-appearance")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("settings-section-navigation")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("settings-section-productivity")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("settings-section-notifications")
    ).toBeInTheDocument();
    expect(screen.getByTestId("settings-section-help")).toBeInTheDocument();

    // Compatibilidad con controles de Theme Studio y Room Branding
    expect(screen.getByTestId("theme-studio-palettes")).toBeInTheDocument();
    expect(screen.getByTestId("accent-swatch-crimson")).toBeInTheDocument();
    expect(screen.getByTestId("theme-studio-density")).toBeInTheDocument();
    expect(screen.getByTestId("density-option-compact")).toBeInTheDocument();
    expect(screen.getByTestId("room-branding-list")).toBeInTheDocument();
    expect(screen.getByTestId("room-branding-room-1")).toBeInTheDocument();
    expect(screen.getByTestId("snooze-preview-box")).toBeInTheDocument();
  });

  it("filtra secciones mediante las pestañas de categoría y el buscador instantáneo", async () => {
    renderSettingsWorkspace();

    await waitFor(() => {
      expect(screen.getByTestId("settings-section-account")).toBeInTheDocument();
    });

    // Seleccionar pestaña 'Productividad y Karma'
    fireEvent.click(screen.getByTestId("settings-tab-productivity"));
    expect(
      screen.getByTestId("settings-section-productivity")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("settings-section-account")
    ).not.toBeInTheDocument();

    // Buscar palabra clave "snooze" -> muestra únicamente Notificaciones
    const searchInput = screen.getByTestId("settings-search-input");
    fireEvent.change(searchInput, { target: { value: "snooze" } });

    expect(
      screen.getByTestId("settings-section-notifications")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("settings-section-productivity")
    ).not.toBeInTheDocument();

    // Buscar "vacaciones" -> muestra Productividad
    fireEvent.change(searchInput, { target: { value: "vacaciones" } });
    expect(
      screen.getByTestId("settings-section-productivity")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("settings-section-notifications")
    ).not.toBeInTheDocument();
  });

  it("permite editar perfil (PATCH /auth/me), cambiar contraseña (POST /auth/change-password) y cerrar todas las sesiones (POST /auth/logout-all)", async () => {
    vi.mocked(api.patch).mockResolvedValueOnce({
      data: {
        id: "usr-001",
        nombre: "Ana María",
        email: "anamaria@prioritask.dev",
      },
    });
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        access_token: "new-rotated-jwt",
        refresh_token: "new-rotated-refresh",
      },
    });
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { message: "Todas las sesiones han sido cerradas" },
    });

    renderSettingsWorkspace();

    await waitFor(() => {
      expect(screen.getByTestId("account-name-input")).toHaveValue(
        "Ana García"
      );
    });

    // 1. Actualizar nombre y correo
    fireEvent.change(screen.getByTestId("account-name-input"), {
      target: { value: "Ana María" },
    });
    fireEvent.change(screen.getByTestId("account-email-input"), {
      target: { value: "anamaria@prioritask.dev" },
    });
    fireEvent.submit(screen.getByTestId("account-profile-form"));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/auth/me", {
        nombre: "Ana María",
        email: "anamaria@prioritask.dev",
      });
    });

    // 2. Cambiar contraseña y rotar token local
    fireEvent.change(screen.getByTestId("current-password-input"), {
      target: { value: "OldSecret123!" },
    });
    fireEvent.change(screen.getByTestId("new-password-input"), {
      target: { value: "NewSecret456!" },
    });
    fireEvent.submit(screen.getByTestId("change-password-form"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/change-password", {
        current_password: "OldSecret123!",
        new_password: "NewSecret456!",
      });
    });
    expect(localStorage.getItem("token")).toBe("new-rotated-jwt");

    // 3. Cerrar todas las sesiones activas
    fireEvent.click(screen.getByTestId("logout-all-btn"));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/logout-all");
    });
  });

  it("sincroniza en tiempo real los toggles de navegación y favoritos con el Sidebar, activa Modo Vacaciones y restablece de fábrica", async () => {
    renderSettingsWorkspace(true);

    await waitFor(() => {
      expect(
        screen.getByTestId("settings-section-navigation")
      ).toBeInTheDocument();
    });

    // Inicialmente el enlace "Agrupadas" existe en el Sidebar y no hay sección Favoritos
    expect(screen.getByTitle("Agrupadas")).toBeInTheDocument();
    expect(
      screen.queryByTestId("sidebar-favorites-section")
    ).not.toBeInTheDocument();

    // Ocultar módulo "Agrupadas por IA" desde Settings
    fireEvent.click(screen.getByTestId("nav-toggle-groupedAi"));
    expect(screen.queryByTitle("Agrupadas")).not.toBeInTheDocument();

    // Marcar "Cocina Principal" (room-1) como favorita -> aparece sección ⭐ Favoritos en Sidebar
    fireEvent.click(screen.getByTestId("favorite-room-toggle-room-1"));
    expect(screen.getByTestId("sidebar-favorites-section")).toBeInTheDocument();

    // Activar Modo Vacaciones
    const vacationToggle = screen.getByTestId("vacation-mode-toggle");
    expect(vacationToggle).not.toBeChecked();
    fireEvent.click(vacationToggle);
    expect(vacationToggle).toBeChecked();

    // Restablecer configuración de fábrica -> restaura "Agrupadas", limpia favoritos y desactiva vacaciones
    fireEvent.click(screen.getByTestId("reset-settings-btn"));
    expect(screen.getByTitle("Agrupadas")).toBeInTheDocument();
    expect(
      screen.queryByTestId("sidebar-favorites-section")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("vacation-mode-toggle")).not.toBeChecked();
  });
});
