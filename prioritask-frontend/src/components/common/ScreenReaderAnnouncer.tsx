import { useState, useEffect } from "react";

const ANNOUNCE_EVENT = "prioritask:screen-reader-announce";

/**
 * Función global para anunciar eventos a lectores de pantalla (NVDA, TalkBack, VoiceOver).
 */
// eslint-disable-next-line react-refresh/only-export-components
export const announce = (message: string) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(ANNOUNCE_EVENT, {
        detail: { message },
      })
    );
  }
};

/**
 * Hook opcional para emitir anuncios accesibles.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useScreenReaderAnnouncer = () => {
  return { announce };
};

/**
 * Componente de región viva accesible (WCAG 2.1 AA) para lectores de pantalla.
 * Se ubica globalmente en App.tsx.
 */
export const ScreenReaderAnnouncer = () => {
  const [announcement, setAnnouncement] = useState<string>("");

  useEffect(() => {
    const handleAnnounce = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string }>;
      if (customEvent.detail?.message) {
        setAnnouncement(customEvent.detail.message);
      }
    };

    window.addEventListener(ANNOUNCE_EVENT, handleAnnounce);
    return () => {
      window.removeEventListener(ANNOUNCE_EVENT, handleAnnounce);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: "0",
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: "0",
      }}
      data-testid="screen-reader-announcer"
    >
      {announcement}
    </div>
  );
};

export default ScreenReaderAnnouncer;
