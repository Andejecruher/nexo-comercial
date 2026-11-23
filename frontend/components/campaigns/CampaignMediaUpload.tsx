'use client';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { campaignsApi, type CampaignAttachment } from '@/lib/campaigns-api';
import {
  WhatsAppMediaPreview,
  type WhatsAppPreviewMedia,
} from '@/components/ui/whatsapp-mobile-preview';

export function CampaignMediaUpload({
  kind,
  name,
  lineId,
  templateId,
  value,
  preview,
  onFileChange,
  onChange,
  onBusy,
}: {
  kind: CampaignAttachment['mediaType'];
  name: string;
  lineId: string;
  templateId: string;
  value?: CampaignAttachment;
  preview?: WhatsAppPreviewMedia;
  onFileChange: (file: File) => void;
  onChange: (value: CampaignAttachment | undefined) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const accept =
    kind === 'IMAGE' ? 'image/jpeg,image/png' : kind === 'VIDEO' ? 'video/mp4' : 'application/pdf';
  const max = kind === 'IMAGE' ? 5 : 16;
  const upload = async (files: File[]) => {
    if (busy || !files.length) return;
    if (files.length !== 1) {
      setError('Selecciona un solo archivo');
      return;
    }
    const file = files[0];
    if (!accept.split(',').includes(file.type) || !file.size || file.size > max * 1024 * 1024) {
      setError(`Selecciona un archivo compatible de hasta ${max} MB`);
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setError('');
    setBusy(true);
    onBusy(true);
    onChange(undefined);
    onFileChange(file);
    try {
      const result = await campaignsApi.uploadMedia(
        file,
        { name, lineId, templateId },
        abort.signal,
      );
      if (!abort.signal.aborted) onChange(result);
    } catch (err) {
      if (!abort.signal.aborted)
        setError(err instanceof Error ? err.message : 'No se pudo cargar el archivo');
    } finally {
      if (!abort.signal.aborted) {
        setBusy(false);
        onBusy(false);
      }
    }
  };
  return (
    <section className="space-y-3" aria-label="Adjunto de la plantilla">
      <h2 className="font-medium">
        {kind === 'IMAGE' ? 'Imagen' : kind === 'VIDEO' ? 'Video' : 'Documento'} de encabezado
      </h2>
      <div
        aria-busy={busy}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
        className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 ${dragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'}`}
      >
        {preview ? (
          <WhatsAppMediaPreview media={preview} />
        ) : (
          <Upload className="size-6" aria-hidden />
        )}
        {preview && kind !== 'DOCUMENT' && (
          <p className="max-w-full break-all text-sm">{preview.name}</p>
        )}
        {busy && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Subiendo archivo…
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="w-full rounded-md p-2 text-sm font-medium focus-visible:outline-primary disabled:opacity-50"
        >
          {preview ? 'Cambiar archivo' : 'Arrastra un archivo o haz clic para seleccionarlo'}
        </button>
        <span className="text-xs text-muted-foreground">
          {kind === 'IMAGE' ? 'JPEG o PNG' : kind === 'VIDEO' ? 'MP4 (H.264/AAC)' : 'PDF'} · máximo{' '}
          {max} MB
        </span>
      </div>
      <input
        ref={input}
        type="file"
        accept={accept}
        disabled={busy}
        aria-label="Seleccionar adjunto"
        className="sr-only"
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <p className="text-sm text-muted-foreground">
        El archivo se compartirá mediante un enlace público para que WhatsApp pueda entregarlo.
      </p>
      {value && (
        <a className="text-sm underline" href={value.viewUrl} target="_blank" rel="noreferrer">
          Ver {value.filename}
        </a>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
