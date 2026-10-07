import { useEffect, useRef } from "react";
import { LuX, LuKeyboard, LuSearch, LuPlus, LuCornerDownLeft } from "react-icons/lu";

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  category: "General" | "Tareas" | "Navegación";
}

const SHORTCUTS: ShortcutItem[] = [
  {
    keys: ["Ctrl", "K"],
    description: "Abrir la Paleta de Comandos global (búsqueda y saltos rápidos)",
    category: "General",
  },
  {
    keys: ["Cmd", "K"],
    description: "Abrir la Paleta de Comandos en macOS",
    category: "General",
  },
  {
    keys: ["?"],
    description: "Abrir esta ventana de ayuda de atajos de teclado",
    category: "General",
  },
  {
    keys: ["c"],
    description: "Crear una nueva tarea rápidamente desde cualquier pantalla",
    category: "Tareas",
  },
  {
    keys: ["↑", "↓"],
    description: "Navegar hacia arriba o abajo en listas y menús interactivos",
    category: "Navegación",
  },
  {
    keys: ["Enter"],
    description: "Confirmar selección o ejecutar acción destacada",
    category: "Navegación",
  },
  {
    keys: ["Escape"],
    description: "Cerrar modales, menús desplegables y paletas abiertas",
    category: "Navegación",
  },
];

export const KeyboardShortcutsModal = ({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const categories: Array<"General" | "Tareas" | "Navegación"> = [
    "General",
    "Tareas",
    "Navegación",
  ];

  return (
    <div
      className="modal-backdrop-custom d-flex align-items-center justify-content-center p-3"
      onClick={onClose}
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 10000,
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      <div
        ref={modalRef}
        className="card border-0 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-modal-title"
        style={{
          width: "100%",
          maxWidth: "560px",
          borderRadius: "16px",
          overflow: "hidden",
        }}
      >
        {/* Cabecera del modal */}
        <div className="card-header bg-transparent border-bottom d-flex align-items-center justify-content-between p-3 px-4">
          <div className="d-flex align-items-center gap-2">
            <div
              className="p-2 rounded-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center"
              style={{ width: "36px", height: "36px" }}
            >
              <LuKeyboard size={20} aria-hidden="true" />
            </div>
            <div>
              <h5 id="shortcuts-modal-title" className="mb-0 fw-bold fs-6">
                Atajos de Teclado
              </h5>
              <p className="text-muted small mb-0">
                Navega y administra tu productividad a máxima velocidad
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-light rounded-pill p-1 d-flex align-items-center justify-content-center"
            onClick={onClose}
            aria-label="Cerrar modal de atajos"
            style={{ width: "32px", height: "32px" }}
          >
            <LuX size={18} />
          </button>
        </div>

        {/* Contenido por categorías */}
        <div
          className="card-body p-4"
          style={{ maxHeight: "450px", overflowY: "auto" }}
        >
          {categories.map((category) => {
            const items = SHORTCUTS.filter((s) => s.category === category);
            return (
              <div key={category} className="mb-4">
                <h6
                  className="text-uppercase text-muted fw-bold mb-2"
                  style={{ fontSize: "0.72rem", letterSpacing: "0.05em" }}
                >
                  {category}
                </h6>
                <div className="list-group list-group-flush rounded-3 border">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="list-group-item d-flex align-items-center justify-content-between py-2 px-3 bg-transparent"
                    >
                      <span className="small text-secondary-emphasis">
                        {item.description}
                      </span>
                      <div className="d-flex align-items-center gap-1 flex-shrink-0 ms-3">
                        {item.keys.map((k, kIdx) => (
                          <kbd
                            key={kIdx}
                            className="px-2 py-1 bg-body-tertiary border text-body-secondary rounded shadow-sm"
                            style={{
                              fontSize: "0.75rem",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            }}
                          >
                            {k === "Enter" ? (
                              <span className="d-inline-flex align-items-center gap-1">
                                <LuCornerDownLeft size={11} /> Enter
                              </span>
                            ) : k === "Ctrl" || k === "Cmd" ? (
                              k
                            ) : k === "c" ? (
                              <span className="d-inline-flex align-items-center gap-1">
                                <LuPlus size={11} /> c
                              </span>
                            ) : (
                              k
                            )}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="p-3 rounded-3 bg-body-tertiary border text-muted small d-flex align-items-center gap-2">
            <LuSearch size={16} className="text-primary flex-shrink-0" />
            <span>
              Tip: Los atajos de una sola tecla (como <kbd>c</kbd>) solo se activan cuando no estás editando texto en un campo o formulario.
            </span>
          </div>
        </div>

        {/* Pie */}
        <div className="card-footer bg-transparent border-top p-3 px-4 d-flex justify-content-end">
          <button
            type="button"
            className="btn btn-primary btn-sm px-3"
            onClick={onClose}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsModal;
