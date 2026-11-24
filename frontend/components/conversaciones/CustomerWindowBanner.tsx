'use client';
import { Button } from '@/components/ui/button';
export function CustomerWindowBanner({
  loading,
  error,
  onStart,
}: {
  loading: boolean;
  error?: string;
  onStart: () => void;
}) {
  if (loading)
    return (
      <p role="status" className="text-sm p-3">
        Comprobando ventana de atención…
      </p>
    );
  return (
    <div
      role="status"
      className="rounded border border-amber-300 bg-amber-50 text-amber-950 p-3 mb-2 text-sm"
    >
      <p>
        {error
          ? `No se pudo verificar la ventana: ${error}`
          : 'La ventana de atención de 24 horas está cerrada. Envía una plantilla aprobada para retomar el contacto; podrás enviar mensajes libres cuando el ciudadano responda.'}
      </p>
      <Button type="button" variant="outline" className="mt-2" onClick={onStart}>
        Iniciar conversación con plantilla
      </Button>
    </div>
  );
}
