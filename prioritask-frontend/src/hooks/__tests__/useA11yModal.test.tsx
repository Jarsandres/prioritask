import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React, { useRef } from "react";
import useA11yModal from "../useA11yModal";

const TestModalComponent = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useA11yModal({ isOpen, onClose, modalRef });

  if (!isOpen) return null;

  return (
    <div ref={modalRef} role="dialog">
      <button data-testid="first-btn">Primero</button>
      <input data-testid="input-elem" placeholder="Campo" />
      <button data-testid="last-btn">Último</button>
    </div>
  );
};

describe("useA11yModal Hook", () => {
  it("bloquea el scroll del body al abrirse y lo restaura al cerrarse", () => {
    const { rerender } = render(
      <TestModalComponent isOpen={true} onClose={vi.fn()} />
    );

    expect(document.body.style.overflow).toBe("hidden");

    rerender(<TestModalComponent isOpen={false} onClose={vi.fn()} />);

    expect(document.body.style.overflow).toBe("");
  });

  it("llama a onClose cuando se presiona la tecla Escape", () => {
    const onClose = vi.fn();
    render(<TestModalComponent isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });

  it("realiza focus trap ciclando el foco con Tab y Shift+Tab dentro del modal", () => {
    render(<TestModalComponent isOpen={true} onClose={vi.fn()} />);

    const firstBtn = screen.getByTestId("first-btn");
    const lastBtn = screen.getByTestId("last-btn");

    lastBtn.focus();
    expect(document.activeElement).toBe(lastBtn);

    // Tab en el último elemento debe mover el foco al primer elemento
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(firstBtn);

    // Shift+Tab en el primer elemento debe mover el foco al último elemento
    firstBtn.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastBtn);
  });
});
