import axios from "axios";
import type { TokenResponse, RefreshTokenRequest } from "./types/auth";
import { enqueueMutation } from "./services/offlineQueue";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1",
});

// Añadir token a cada petición
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Interceptor de errores para clasificar fallos, refrescar token y encolar mutaciones offline
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthRoute =
      originalRequest?.url?.includes("/auth/login") ||
      originalRequest?.url?.includes("/auth/register") ||
      originalRequest?.url?.includes("/auth/refresh");

    // Clasificar errores sin respuesta como desconexión de red y encolar mutaciones
    if (!error.response && !axios.isCancel(error)) {
      error.message = "Sin conexión a internet. La acción se canceló";

      const method = (originalRequest?.method || "GET").toUpperCase();
      const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
      const isSyncing = (originalRequest as { _isOfflineSync?: boolean })?._isOfflineSync;

      if (isMutation && !isAuthRoute && !isSyncing && originalRequest?.url) {
        try {
          let payloadData = originalRequest.data;
          if (typeof payloadData === "string") {
            try {
              payloadData = JSON.parse(payloadData);
            } catch {
              // Mantener como string si no era JSON
            }
          }

          await enqueueMutation({
            url: originalRequest.url,
            method: method as "POST" | "PUT" | "PATCH" | "DELETE",
            data: payloadData,
            params: originalRequest.params,
          });
          (error as { isOfflineQueued?: boolean }).isOfflineQueued = true;
        } catch (enqueueErr) {
          console.warn("No se pudo guardar la mutación en la cola offline:", enqueueErr);
        }
      }
    }

    // Clasificar códigos HTTP específicos de carga de archivos y cuota
    if (error.response?.status === 413) {
      const msg413 = "El archivo supera el tamaño máximo permitido de 10 MB";
      error.message = msg413;
      if (error.response.data && typeof error.response.data === "object") {
        (error.response.data as { detail?: string }).detail = msg413;
      }
    } else if (error.response?.status === 415) {
      const msg415 = "Formato de archivo no soportado. Suba JPEG, PNG, WebP o PDF";
      error.message = msg415;
      if (error.response.data && typeof error.response.data === "object") {
        (error.response.data as { detail?: string }).detail = msg415;
      }
    }

    // Solo intentar refresh si NO es ruta de auth y no se ha reintentado aún
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthRoute
    ) {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) {
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        window.location.href = "/login";
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        const refreshResponse = await api.post<TokenResponse>(
          "/auth/refresh",
          { refresh_token: refreshToken } satisfies RefreshTokenRequest
        );
        const { access_token: newAccessToken, refresh_token: newRefreshToken } =
          refreshResponse.data;

        // Validar que ambos tokens sean válidos
        if (!newAccessToken || !newRefreshToken) {
          throw new Error("El servidor no devolvió tokens válidos en el refresh.");
        }

        localStorage.setItem("token", newAccessToken);
        localStorage.setItem("refreshToken", newRefreshToken);
        originalRequest.headers["Authorization"] = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
