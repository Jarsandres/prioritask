import "@testing-library/jest-dom/vitest";

// Fallbacks de entorno jsdom para APIs del navegador de blobs y URLs
if (typeof window !== "undefined") {
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = () =>
      `blob:mock-url-${Math.random().toString(36).slice(2, 9)}`;
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = () => {};
  }
}
