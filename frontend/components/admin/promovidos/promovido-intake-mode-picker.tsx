'use client';

import { useIsMobile } from '@/components/ui/use-mobile';
import { Camera, FolderOpen, Pencil } from 'lucide-react';
import { useRef, type ChangeEvent } from 'react';

export type IntakeFileSource = 'camera' | 'file';

interface PromovidoIntakeModePickerProps {
  onFileSelected: (file: File, source: IntakeFileSource) => void;
  onWebcam: () => void;
  onManual: () => void;
}

const CARD_CLASS =
  'flex min-h-16 w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring';

export function PromovidoIntakeModePicker({
  onFileSelected,
  onWebcam,
  onManual,
}: PromovidoIntakeModePickerProps) {
  const isMobile = useIsMobile();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (source: IntakeFileSource) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFileSelected(file, source);
  };

  return (
    <div className="grid gap-3">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange('camera')}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange('file')}
      />

      <button
        type="button"
        onClick={() => (isMobile ? cameraInputRef.current?.click() : onWebcam())}
        aria-label="Tomar foto: abrir cámara para escanear la credencial INE"
        className={CARD_CLASS}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Camera className="h-6 w-6" />
        </div>
        <div>
          <p className="font-semibold">Tomar foto</p>
          <p className="text-sm text-muted-foreground">
            {isMobile ? 'Abrir cámara para escanear INE' : 'Usar la cámara de la computadora'}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        aria-label="Seleccionar archivo: elegir una imagen o PDF de la credencial"
        className={CARD_CLASS}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FolderOpen className="h-6 w-6" />
        </div>
        <div>
          <p className="font-semibold">Seleccionar archivo</p>
          <p className="text-sm text-muted-foreground">Elegir imagen desde la galería</p>
        </div>
      </button>

      <button
        type="button"
        onClick={onManual}
        aria-label="Captura manual: completar los datos del formulario"
        className={CARD_CLASS}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Pencil className="h-6 w-6" />
        </div>
        <div>
          <p className="font-semibold">Captura manual</p>
          <p className="text-sm text-muted-foreground">Completar datos del formulario</p>
        </div>
      </button>
    </div>
  );
}
