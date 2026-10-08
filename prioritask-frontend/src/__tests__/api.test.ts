import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import api from "../api";
import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

describe("api interceptors - error classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clasifica errores HTTP 413 con mensaje específico de límite de 10 MB", async () => {
    const error413 = {
      isAxiosError: true,
      name: "AxiosError",
      message: "Request failed with status code 413",
      config: { url: "/tasks/1/attachments" } as InternalAxiosRequestConfig,
      response: {
        status: 413,
        statusText: "Payload Too Large",
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse,
    } as AxiosError;

    // Obtener los interceptores de respuesta registrados
    const responseInterceptor = (
      api.interceptors.response as unknown as {
        handlers: Array<{
          rejected: (error: AxiosError) => Promise<unknown>;
        }>;
      }
    ).handlers[0];

    await expect(responseInterceptor.rejected(error413)).rejects.toMatchObject({
      message: "El archivo supera el tamaño máximo permitido de 10 MB",
      response: {
        data: {
          detail: "El archivo supera el tamaño máximo permitido de 10 MB",
        },
      },
    });
  });

  it("clasifica errores HTTP 415 con mensaje de formatos admitidos", async () => {
    const error415 = {
      isAxiosError: true,
      name: "AxiosError",
      message: "Request failed with status code 415",
      config: { url: "/tasks/1/attachments" } as InternalAxiosRequestConfig,
      response: {
        status: 415,
        statusText: "Unsupported Media Type",
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse,
    } as AxiosError;

    const responseInterceptor = (
      api.interceptors.response as unknown as {
        handlers: Array<{
          rejected: (error: AxiosError) => Promise<unknown>;
        }>;
      }
    ).handlers[0];

    await expect(responseInterceptor.rejected(error415)).rejects.toMatchObject({
      message: "Formato de archivo no soportado. Suba JPEG, PNG, WebP o PDF",
      response: {
        data: {
          detail: "Formato de archivo no soportado. Suba JPEG, PNG, WebP o PDF",
        },
      },
    });
  });

  it("clasifica errores sin respuesta como desconexión de red", async () => {
    const networkError = {
      isAxiosError: true,
      name: "AxiosError",
      message: "Network Error",
      config: { url: "/tasks" } as InternalAxiosRequestConfig,
      response: undefined,
    } as AxiosError;

    const responseInterceptor = (
      api.interceptors.response as unknown as {
        handlers: Array<{
          rejected: (error: AxiosError) => Promise<unknown>;
        }>;
      }
    ).handlers[0];

    await expect(responseInterceptor.rejected(networkError)).rejects.toMatchObject({
      message: "Sin conexión a internet. La acción se canceló",
    });
  });

  it("no sobrescribe el mensaje si el error fue cancelado intencionalmente", async () => {
    const canceledError = {
      isAxiosError: true,
      name: "CanceledError",
      message: "canceled",
      config: { url: "/tasks" } as InternalAxiosRequestConfig,
      response: undefined,
    } as AxiosError;

    vi.spyOn(axios, "isCancel").mockReturnValue(true);

    const responseInterceptor = (
      api.interceptors.response as unknown as {
        handlers: Array<{
          rejected: (error: AxiosError) => Promise<unknown>;
        }>;
      }
    ).handlers[0];

    await expect(responseInterceptor.rejected(canceledError)).rejects.toMatchObject({
      message: "canceled",
    });
  });

  it("encola mutaciones destructivas en cola offline cuando se produce un error de red", async () => {
    const mutationError = {
      isAxiosError: true,
      name: "AxiosError",
      message: "Network Error",
      config: {
        url: "/tasks/99",
        method: "delete",
      } as InternalAxiosRequestConfig,
      response: undefined,
    } as AxiosError;

    const responseInterceptor = (
      api.interceptors.response as unknown as {
        handlers: Array<{
          rejected: (error: AxiosError) => Promise<unknown>;
        }>;
      }
    ).handlers[0];

    await expect(responseInterceptor.rejected(mutationError)).rejects.toMatchObject({
      isOfflineQueued: true,
      message: "Sin conexión a internet. La acción se canceló",
    });
  });
});
