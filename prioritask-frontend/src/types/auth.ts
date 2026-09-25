// ─────────────────────────────────────────────
// Tipos de autenticación y tokens (paridad con app/schemas/user.py)
// ─────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface UserProfile {
  id: string;
  nombre: string;
  email: string;
  is_active?: boolean;
  is_superuser?: boolean;
  role?: string;
}
