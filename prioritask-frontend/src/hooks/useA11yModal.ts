import { useEffect, useRef } from "react";

export interface UseA11yModalOptions {
  isOpen: boolean;
  onClose?: () => void;
  modalRef: React.RefObject<HTMLElement | null>;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  preventScroll?: boolean;
  closeOnEscape?: boolean;
}

const FOCUSABLE_ELEMENTS_SELECTOR =
  'button:not([disabled]), [href]:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

/**
 * Hook de Accesibilidad Universal (WCAG 2.1 AA) para modales y cuadros de diálogo.
 * Gestiona:
 * - Focus Trap (ciclo con Tab y Shift+Tab dentro del contenedor del modal)
 * - Cierre accesible con la tecla Escape
 * - Restauración automática del foco al elemento que abrió el modal
 * - Bloqueo de scroll en el <body> mientras el modal esté activo
 */
export const useA11yModal = ({
  isOpen,
  onClose,
  modalRef,
  initialFocusRef,
  preventScroll = true,
  closeOnEscape = true,
}: UseA11yModalOptions) => {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // 1. Guardar el elemento activo anterior para restaurar el foco al desmontar
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    // 2. Bloquear scroll del body
    const originalBodyOverflow = document.body.style.overflow;
    if (preventScroll) {
      document.body.style.overflow = "hidden";
    }

    const isElementVisible = (el: HTMLElement) => {
      return el.getAttribute("aria-hidden") !== "true" && !el.hidden && el.style.display !== "none";
    };

    // 3. Establecer foco inicial con pequeño timeout para permitir que el DOM se monte
    const focusTimer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (modalRef.current) {
        const focusableElements = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS_SELECTOR)
        ).filter(isElementVisible);

        if (focusableElements.length > 0) {
          focusableElements[0].focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 50);

    // 4. Focus trap y Escape listener
    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
        return;
      }

      if (e.key === "Tab") {
        const modal = modalRef.current;
        if (!modal) return;

        const focusables = Array.from(
          modal.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS_SELECTOR)
        ).filter(isElementVisible);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          // Shift + Tab
          if (
            document.activeElement === firstElement ||
            !modal.contains(document.activeElement)
          ) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab
          if (
            document.activeElement === lastElement ||
            !modal.contains(document.activeElement)
          ) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);

      if (preventScroll) {
        document.body.style.overflow = originalBodyOverflow;
      }

      // Restaurar el foco original
      if (
        previousActiveElementRef.current &&
        typeof previousActiveElementRef.current.focus === "function"
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose, modalRef, initialFocusRef, preventScroll, closeOnEscape]);
};

export default useA11yModal;
