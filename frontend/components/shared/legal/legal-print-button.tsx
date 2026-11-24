'use client';

import { Printer } from 'lucide-react';

/**
 * Botón para imprimir el documento legal. El diálogo del navegador también
 * permite "Guardar como PDF", por lo que no se agrega ninguna dependencia
 * extra de generación de PDF.
 */
export function LegalPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      aria-label="Imprimir o guardar este documento en PDF"
      className="legal-no-print inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Printer className="h-4 w-4" aria-hidden="true" />
      Imprimir o guardar en PDF
    </button>
  );
}
