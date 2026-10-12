import React, { useState } from "react";
import {
  LuEye,
  LuEyeOff,
  LuCircleAlert,
  LuSun,
  LuMoon,
} from "react-icons/lu";
import { useTheme } from "../../context/ThemeContext";
import "../../auth/Auth.css";

// --- HELPER COMPONENTS (ICONS) ---

export const GoogleIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="auth-google-icon"
    viewBox="0 0 48 48"
    aria-hidden="true"
  >
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z"
    />
  </svg>
);

// --- TYPE DEFINITIONS ---

export interface Testimonial {
  avatarSrc: string;
  name: string;
  handle: string;
  text: string;
  badge?: string;
}

export interface SignInPageProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  heroImageSrc?: string;
  testimonials?: Testimonial[];
  onSignIn?: (event: React.FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn?: () => void;
  onResetPassword?: () => void;
  onCreateAccount?: () => void;
  // Propiedades de control para integración nativa con Prioritask
  email?: string;
  onEmailChange?: (value: string) => void;
  password?: string;
  onPasswordChange?: (value: string) => void;
  rememberMe?: boolean;
  onRememberMeChange?: (checked: boolean) => void;
  error?: string;
  isLoading?: boolean;
  submitLabel?: string;
  loadingLabel?: string;
  customFormContent?: React.ReactNode;
  children?: React.ReactNode;
  footerContent?: React.ReactNode;
  showSocialAuth?: boolean;
  showLogo?: boolean;
}

// --- SUB-COMPONENTS ---

export const GlassInputWrapper: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <div className={`glass-input-wrapper ${className}`.trim()}>{children}</div>
);

export const TestimonialCard: React.FC<{
  testimonial: Testimonial;
  delay: string;
}> = ({ testimonial, delay }) => (
  <div className={`animate-testimonial ${delay} testimonial-glass-card`}>
    <img
      src={testimonial.avatarSrc}
      className="testimonial-avatar"
      alt={`Avatar de ${testimonial.name}`}
      loading="lazy"
    />
    <div className="testimonial-content">
      <div className="testimonial-header-row">
        <div className="testimonial-identity">
          <p className="testimonial-name">{testimonial.name}</p>
          <p className="testimonial-handle">{testimonial.handle}</p>
        </div>
        {testimonial.badge && (
          <span className="testimonial-badge">{testimonial.badge}</span>
        )}
      </div>
      <p className="testimonial-text">{testimonial.text}</p>
    </div>
  </div>
);

// --- MAIN COMPONENT ---

export const SignInPage: React.FC<SignInPageProps> = ({
  title = (
    <span className="auth-title-gradient">Bienvenido a Prioritask</span>
  ),
  description = "Accede a tu cuenta y organiza las prioridades de tu hogar en equipo",
  heroImageSrc,
  testimonials = [],
  onSignIn,
  onGoogleSignIn,
  onResetPassword,
  onCreateAccount,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  rememberMe,
  onRememberMeChange,
  error,
  isLoading = false,
  submitLabel = "Iniciar sesión",
  loadingLabel = "Iniciando sesión...",
  customFormContent,
  children,
  footerContent,
  showSocialAuth = true,
  showLogo = true,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const customFields = customFormContent ?? children;

  const isEmailControlled = email !== undefined && onEmailChange !== undefined;
  const isPasswordControlled =
    password !== undefined && onPasswordChange !== undefined;
  const isRememberControlled =
    rememberMe !== undefined && onRememberMeChange !== undefined;

  return (
    <div className="auth-split-root">
      {/* Selector de tema flotante (preserva selector E2E button[aria-label*="modo"]) */}
      <button
        type="button"
        className="auth-theme-toggle"
        onClick={toggleTheme}
        aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
        title={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
      >
        {theme === "dark" ? <LuSun size={18} /> : <LuMoon size={18} />}
      </button>

      {/* Left column: sign-in / auth form */}
      <section className="auth-split-left">
        <div className="auth-split-form-shell">
          {showLogo && (
            <div className="animate-element animate-delay-100 auth-brand-row">
              <div className="auth-logo-badge auth-logo-badge-inline">
                <img
                  src="/logo.png"
                  alt="Prioritask logo"
                  className="auth-logo-img"
                />
              </div>
              <span className="auth-brand-name">Prioritask</span>
            </div>
          )}

          <h1 className="animate-element animate-delay-100 auth-title auth-split-title">
            {title}
          </h1>
          <p className="animate-element animate-delay-200 auth-subtitle auth-split-description">
            {description}
          </p>

          <form
            className="auth-split-form"
            onSubmit={onSignIn}
            noValidate
          >
            {error && (
              <div className="auth-error-banner" role="alert">
                <LuCircleAlert
                  size={18}
                  className="auth-error-icon"
                  aria-hidden="true"
                />
                <span>{error}</span>
              </div>
            )}

            {customFields ? (
              customFields
            ) : (
              <>
                <div className="animate-element animate-delay-300 auth-field-group">
                  <label
                    htmlFor="auth-email-input"
                    className="auth-field-label"
                  >
                    Correo electrónico
                  </label>
                  <GlassInputWrapper>
                    <input
                      id="auth-email-input"
                      name="email"
                      type="email"
                      placeholder="Introduce tu correo electrónico"
                      className="auth-glass-input"
                      {...(isEmailControlled
                        ? {
                            value: email,
                            onChange: (e) => onEmailChange(e.target.value),
                          }
                        : { defaultValue: email })}
                      disabled={isLoading}
                      required
                      autoComplete="email"
                    />
                  </GlassInputWrapper>
                </div>

                <div className="animate-element animate-delay-400 auth-field-group">
                  <label
                    htmlFor="auth-password-input"
                    className="auth-field-label"
                  >
                    Contraseña
                  </label>
                  <GlassInputWrapper>
                    <div className="auth-password-field-inner">
                      <input
                        id="auth-password-input"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Introduce tu contraseña"
                        className="auth-glass-input auth-glass-input-password"
                        {...(isPasswordControlled
                          ? {
                              value: password,
                              onChange: (e) => onPasswordChange(e.target.value),
                            }
                          : { defaultValue: password })}
                        disabled={isLoading}
                        required
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="auth-eye-toggle-btn"
                        aria-label={
                          showPassword
                            ? "Ocultar contraseña"
                            : "Ver contraseña"
                        }
                      >
                        {showPassword ? (
                          <LuEyeOff className="auth-eye-icon" size={20} />
                        ) : (
                          <LuEye className="auth-eye-icon" size={20} />
                        )}
                      </button>
                    </div>
                  </GlassInputWrapper>
                </div>

                <div className="animate-element animate-delay-500 auth-options-row">
                  <label className="auth-remember-label">
                    <input
                      type="checkbox"
                      name="rememberMe"
                      className="auth-custom-checkbox"
                      {...(isRememberControlled
                        ? {
                            checked: rememberMe,
                            onChange: (e) =>
                              onRememberMeChange(e.target.checked),
                          }
                        : { defaultChecked: rememberMe })}
                      disabled={isLoading}
                    />
                    <span className="auth-remember-text">
                      Mantener sesión iniciada
                    </span>
                  </label>
                  <a
                    href="#reset-password"
                    onClick={(e) => {
                      e.preventDefault();
                      onResetPassword?.();
                    }}
                    className="auth-reset-link"
                  >
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>

                <button
                  type="submit"
                  className="animate-element animate-delay-600 auth-primary-submit-btn"
                  disabled={isLoading}
                >
                  {isLoading ? loadingLabel : submitLabel}
                </button>
              </>
            )}
          </form>

          {showSocialAuth && (
            <>
              <div className="animate-element animate-delay-700 auth-divider">
                <span className="auth-divider-text">O continúa con</span>
              </div>

              <button
                type="button"
                onClick={() => onGoogleSignIn?.()}
                className="animate-element animate-delay-800 auth-google-btn"
                disabled={isLoading}
              >
                <GoogleIcon />
                <span>Continuar con Google</span>
              </button>
            </>
          )}

          {footerContent ? (
            <div className="animate-element animate-delay-900 auth-split-footer">
              {footerContent}
            </div>
          ) : (
            <p className="animate-element animate-delay-900 auth-split-footer">
              ¿Nuevo en la plataforma?{" "}
              <a
                href="#create-account"
                onClick={(e) => {
                  e.preventDefault();
                  onCreateAccount?.();
                }}
                className="auth-create-account-link"
              >
                Crear una cuenta
              </a>
            </p>
          )}
        </div>
      </section>

      {/* Right column: hero image + testimonials */}
      {heroImageSrc && (
        <section className="auth-split-right">
          <div
            className="animate-slide-right animate-delay-300 auth-hero-image"
            style={{ backgroundImage: `url(${heroImageSrc})` }}
            role="img"
            aria-label="Escaparate visual de organización del hogar en Prioritask"
          >
            <div className="auth-hero-gradient-overlay" aria-hidden="true" />
          </div>
          {testimonials.length > 0 && (
            <div className="auth-testimonials-dock">
              <TestimonialCard
                testimonial={testimonials[0]}
                delay="animate-delay-1000"
              />
              {testimonials[1] && (
                <div className="auth-testimonial-slot-xl">
                  <TestimonialCard
                    testimonial={testimonials[1]}
                    delay="animate-delay-1200"
                  />
                </div>
              )}
              {testimonials[2] && (
                <div className="auth-testimonial-slot-2xl">
                  <TestimonialCard
                    testimonial={testimonials[2]}
                    delay="animate-delay-1400"
                  />
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default SignInPage;
