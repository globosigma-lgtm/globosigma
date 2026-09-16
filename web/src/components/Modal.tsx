import { useEffect, type ReactNode } from "react";

export function Modal({
  titulo,
  onFechar,
  children,
}: {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal__header">
          <h2 className="modal__title">{titulo}</h2>
          <button type="button" className="modal__close" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
