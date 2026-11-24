'use client';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, ExternalLink, X } from 'lucide-react';

interface MessageMediaPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  downloadUrl?: string;
  filename?: string;
  kind: 'image' | 'video' | 'document';
}

export function MessageMediaPreviewDialog({
  open,
  onOpenChange,
  src,
  downloadUrl,
  filename,
  kind,
}: MessageMediaPreviewDialogProps) {
  const label =
    filename ||
    (kind === 'image' ? 'Imagen adjunta' : kind === 'video' ? 'Video adjunto' : 'Documento');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] gap-3 overflow-hidden p-0 sm:max-w-5xl"
      >
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b px-4 py-3 pr-2 text-left">
          <DialogTitle className="min-w-0 truncate text-base" title={label}>
            {label}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={downloadUrl ?? src}
              download={filename}
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Descargar archivo"
              title="Descargar archivo"
            >
              <Download className="size-4" aria-hidden />
            </a>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Abrir en una nueva pestaña"
              title="Abrir en una nueva pestaña"
            >
              <ExternalLink className="size-4" aria-hidden />
            </a>
            <DialogClose
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Cerrar vista previa"
              title="Cerrar vista previa"
            >
              <X className="size-4" aria-hidden />
            </DialogClose>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-auto bg-muted/30 p-3 sm:p-5">
          {kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={label}
              className="mx-auto max-h-[75dvh] max-w-full object-contain"
            />
          ) : kind === 'video' ? (
            <video
              controls
              playsInline
              preload="metadata"
              aria-label={`Video ${label}`}
              src={src}
              className="mx-auto max-h-[75dvh] max-w-full rounded bg-black object-contain"
            >
              El navegador no reproduce este video.
            </video>
          ) : (
            <iframe
              title={`Vista previa de ${label}`}
              src={src}
              className="h-[75dvh] w-full rounded border bg-white"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
