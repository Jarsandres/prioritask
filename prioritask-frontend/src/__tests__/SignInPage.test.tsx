import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SignInPage } from "../components/ui/SignInPage";
import { ThemeProvider } from "../context/ThemeContext";
import { ToastProvider } from "../context/ToastContext";
import Login, {
  PRIORITASK_HERO_IMAGE,
  PRIORITASK_TESTIMONIALS,
  REMEMBER_EMAIL_STORAGE_KEY,
} from "../auth/Login";
import Register from "../auth/Register";

describe("SignInPage Component & Auth Split-Screen Redesign", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-accent");
  });

  it("renderiza título, descripción, imagen hero, testimonios con badges de Prioritask y selector de tema", () => {
    render(
      <ThemeProvider>
        <SignInPage
          title="Bienvenido de nuevo"
          description="Organiza tu hogar en equipo"
          heroImageSrc={PRIORITASK_HERO_IMAGE}
          testimonials={PRIORITASK_TESTIMONIALS}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByRole("heading", { name: /Bienvenido de nuevo/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Organiza tu hogar en equipo/i)
    ).toBeInTheDocument();

    // Verificar los 3 testimonios con la esencia de Prioritask
    expect(screen.getByText("Elena Martínez")).toBeInTheDocument();
    expect(screen.getByText("🔥 Racha 14d · P1")).toBeInTheDocument();
    expect(screen.getByText("Carlos & Sofía")).toBeInTheDocument();
    expect(screen.getByText("⚖️ Reparto 50/50")).toBeInTheDocument();
    expect(screen.getByText("Familia Vega")).toBeInTheDocument();
    expect(screen.getByText("👏 +120 pts Kiosco")).toBeInTheDocument();

    // Verificar el botón flotante de tema (selector requerido por e2e/smoke.spec.ts)
    const themeToggle = screen.getByRole("button", { name: /Cambiar a modo/i });
    expect(themeToggle).toBeInTheDocument();
    const initialTheme = document.documentElement.getAttribute("data-theme");
    fireEvent.click(themeToggle);
    expect(document.documentElement.getAttribute("data-theme")).not.toBe(
      initialTheme
    );
  });

  it("permite alternar la visibilidad de la contraseña", () => {
    render(
      <ThemeProvider>
        <SignInPage />
      </ThemeProvider>
    );

    const passwordInput = screen.getByPlaceholderText(
      /Introduce tu contraseña/i
    ) as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const toggleBtn = screen.getByRole("button", { name: /Ver contraseña/i });
    fireEvent.click(toggleBtn);
    expect(passwordInput.type).toBe("text");

    const hideBtn = screen.getByRole("button", { name: /Ocultar contraseña/i });
    fireEvent.click(hideBtn);
    expect(passwordInput.type).toBe("password");
  });

  it("invoca onSignIn, onGoogleSignIn, onResetPassword y onCreateAccount correctamente", () => {
    const onSignIn = vi.fn((e: React.FormEvent<HTMLFormElement>) =>
      e.preventDefault()
    );
    const onGoogleSignIn = vi.fn();
    const onResetPassword = vi.fn();
    const onCreateAccount = vi.fn();

    render(
      <ThemeProvider>
        <SignInPage
          onSignIn={onSignIn}
          onGoogleSignIn={onGoogleSignIn}
          onResetPassword={onResetPassword}
          onCreateAccount={onCreateAccount}
        />
      </ThemeProvider>
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Continuar con Google/i })
    );
    expect(onGoogleSignIn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(/¿Olvidaste tu contraseña\?/i));
    expect(onResetPassword).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(/Crear una cuenta/i));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);

    const submitBtn = screen.getByRole("button", { name: /Iniciar sesión/i });
    fireEvent.click(submitBtn);
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("integra Login con autocompletado de rememberMe y notificaciones Toast en acciones secundarias", () => {
    localStorage.setItem(REMEMBER_EMAIL_STORAGE_KEY, "elena@prioritask.app");

    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <Login />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    const emailInput = screen.getByPlaceholderText(
      /Introduce tu correo electrónico/i
    ) as HTMLInputElement;
    expect(emailInput.value).toBe("elena@prioritask.app");

    // Si se desmarca rememberMe, limpia el correo recordado en localStorage
    const rememberCheckbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(rememberCheckbox.checked).toBe(true);
    fireEvent.click(rememberCheckbox);
    expect(rememberCheckbox.checked).toBe(false);
    expect(localStorage.getItem(REMEMBER_EMAIL_STORAGE_KEY)).toBeNull();

    // Clic en Continuar con Google dispara notificación Toast informativa
    fireEvent.click(
      screen.getByRole("button", { name: /Continuar con Google/i })
    );
    expect(
      screen.getByText(/El inicio de sesión con Google OAuth estará disponible/i)
    ).toBeInTheDocument();
  });

  it("integra Register con el layout Split-Screen y valida contraseñas", () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <Register />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: /Crear cuenta/i })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Ej\. Alex Gómez/i), {
      target: { value: "Alex Gómez" },
    });
    fireEvent.change(screen.getByPlaceholderText(/nombre@ejemplo\.com/i), {
      target: { value: "alex@ejemplo.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Mínimo 6 caracteres/i), {
      target: { value: "secreto123" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Repite la contraseña/i), {
      target: { value: "distinta123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Crear cuenta/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Las contraseñas no coinciden/i
    );
  });
});
