'use client';

import { ContactEditor } from './ContactEditor';
import { CameraCaptureDialog } from '@/components/domain/messaging/CameraCaptureDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PreparedAttachmentPayload } from '@/hooks/useConversationMessages';
import { cn } from '@/lib/utils';
import { Camera, FileText, Headphones, ImageIcon, Paperclip, UserRound, X } from 'lucide-react';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 16 * 1024 * 1024;
const VIDEO_MIME_TYPES = ['video/mp4', 'video/3gpp'];
const SIZE_DIGITS = /^\d+$/;

const DOCUMENT_ACCEPT = 'application/pdf,.doc,.docx,.xls,.xlsx,.txt';
const CAMERA_ACCEPT = 'image/*';
const GALLERY_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/3gpp';
const AUDIO_ACCEPT = 'audio/ogg,audio/mpeg,audio/mp4,audio/aac,audio/amr';
type PickerKind = 'document' | 'camera' | 'gallery' | 'audio' | 'contact';

export interface AttachmentUploaderProps {
  value: PreparedAttachmentPayload[];
  onChange: (next: PreparedAttachmentPayload[]) => void;
  disabled?: boolean;
  className?: string;
}

function toAttachment(file: File): PreparedAttachmentPayload {
  return {
    file,
    storageKey: '',
    mimeType: file.type || 'application/octet-stream',
    fileSizeBytes: String(file.size),
    originalFilename: file.name,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  };
}

function appendPickedFiles(
  files: FileList,
  current: PreparedAttachmentPayload[],
): { next: PreparedAttachmentPayload[]; error?: string } {
  const newRows: PreparedAttachmentPayload[] = [];
  let error: string | undefined;

  for (let i = 0; i < files.length; i++) {
    if (current.length + newRows.length >= 10) {
      error = 'Máximo 10 archivos por envío';
      break;
    }
    const f = files[i];
    const cap = f.type.startsWith('image/')
      ? 5
      : f.type.startsWith('audio/') || f.type.startsWith('video/')
        ? 16
        : 25;
    if (!f.size || f.size > cap * 1024 * 1024) {
      error = `El archivo supera ${cap} MB`;
      continue;
    }
    newRows.push(toAttachment(f));
  }

  return { next: newRows.length > 0 ? [...current, ...newRows] : current, error };
}

export function revokeAttachmentPreviews(rows: PreparedAttachmentPayload[]) {
  for (const row of rows) {
    if (row.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(row.previewUrl);
  }
}

function ClipGlyph({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full shadow-sm',
        className,
      )}
    >
      {children}
    </span>
  );
}

const iconClass = 'size-[18px] text-white';

export function AttachmentPickerTrigger({
  value,
  onChange,
  disabled,
  onError,
  onPickAudio,
}: AttachmentUploaderProps & {
  onError?: (message?: string) => void;
  onPickAudio?: (file: File) => void;
}) {
  const listId = useId();
  const documentInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const onPickFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;
      const { next, error } = appendPickedFiles(files, value);
      onError?.(error);
      onChange(next);
      e.target.value = '';
    },
    [value, onChange, onError],
  );

  const onPickAudioFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      const file = files?.[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) {
        onError?.(`El audio supera ${MAX_FILE_BYTES / (1024 * 1024)} MB`);
        return;
      }
      if (onPickAudio) {
        onPickAudio(file);
        return;
      }
      const { next, error } = appendPickedFiles(files, value);
      onError?.(error);
      onChange(next);
    },
    [onPickAudio, onError, onChange, value],
  );

  const openPicker = (kind: PickerKind) => {
    if (kind === 'contact') {
      setContactOpen(true);
      return;
    }
    if (kind === 'camera') {
      setCameraOpen(true);
      return;
    }
    const refs: Record<
      Exclude<PickerKind, 'camera' | 'contact'>,
      React.RefObject<HTMLInputElement | null>
    > = {
      document: documentInputRef,
      gallery: galleryInputRef,
      audio: audioInputRef,
    };
    refs[kind].current?.click();
  };

  const capturePhoto = (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      onError?.(`El archivo supera ${MAX_FILE_BYTES / (1024 * 1024)} MB`);
      return;
    }
    onChange([...value, toAttachment(file)]);
    onError?.(undefined);
    setCameraOpen(false);
  };

  return (
    <>
      <ContactEditor
        open={contactOpen}
        onOpenChange={setContactOpen}
        onAdd={(contact) =>
          onChange([
            ...value,
            {
              storageKey: '',
              mimeType: 'application/json',
              fileSizeBytes: '1',
              originalFilename: contact.name,
              contactCitizenId: contact.citizenId,
            },
          ])
        }
      />
      <input
        ref={documentInputRef}
        type="file"
        multiple
        accept={DOCUMENT_ACCEPT}
        className="sr-only"
        id={`${listId}-document`}
        disabled={disabled}
        onChange={onPickFiles}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept={CAMERA_ACCEPT}
        className="sr-only"
        id={`${listId}-camera`}
        disabled={disabled}
        onChange={onPickFiles}
      />
      <input
        ref={galleryInputRef}
        type="file"
        multiple
        accept={GALLERY_ACCEPT}
        className="sr-only"
        id={`${listId}-gallery`}
        disabled={disabled}
        onChange={onPickFiles}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        className="sr-only"
        id={`${listId}-audio`}
        disabled={disabled}
        onChange={onPickAudioFiles}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground disabled:opacity-50 shrink-0"
            disabled={disabled}
            aria-label="Adjuntar archivo"
          >
            <Paperclip className="size-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-[220px] p-1.5">
          <DropdownMenuItem
            className="gap-3 rounded-xl py-2.5"
            onPointerDown={(e) => {
              e.preventDefault();
              openPicker('document');
            }}
          >
            <ClipGlyph className="bg-[#5157b8]">
              <FileText className={iconClass} strokeWidth={2.4} aria-hidden />
            </ClipGlyph>
            Documento
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-3 rounded-xl py-2.5"
            onPointerDown={(e) => {
              e.preventDefault();
              openPicker('camera');
            }}
          >
            <ClipGlyph className="bg-[#d3396d]">
              <Camera className={iconClass} strokeWidth={2.4} aria-hidden />
            </ClipGlyph>
            Cámara
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-3 rounded-xl py-2.5"
            onPointerDown={(e) => {
              e.preventDefault();
              openPicker('gallery');
            }}
          >
            <ClipGlyph className="bg-[#ac44cf]">
              <ImageIcon className={iconClass} strokeWidth={2.4} aria-hidden />
            </ClipGlyph>
            Galería
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-3 rounded-xl py-2.5"
            onPointerDown={(e) => {
              e.preventDefault();
              openPicker('audio');
            }}
          >
            <ClipGlyph className="bg-[#f07800]">
              <Headphones className={iconClass} strokeWidth={2.4} aria-hidden />
            </ClipGlyph>
            Audio
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-3 rounded-xl py-2.5"
            onPointerDown={(e) => {
              e.preventDefault();
              openPicker('contact');
            }}
          >
            <ClipGlyph className="bg-[#0ea5a0]">
              <UserRound className={iconClass} strokeWidth={2.4} aria-hidden />
            </ClipGlyph>
            Contacto
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CameraCaptureDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={capturePhoto}
        onPickFile={() => {
          setCameraOpen(false);
          window.setTimeout(() => cameraInputRef.current?.click(), 150);
        }}
      />
    </>
  );
}

export function AttachmentChips({
  value,
  onChange,
  disabled,
  error,
  className,
}: AttachmentUploaderProps & { error?: string }) {
  if (value.length === 0 && !error) return null;

  return (
    <div className={cn('space-y-1.5', className)}>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Adjuntos">
          {value.map((row, index) => (
            <li
              key={`att-chip-${index}-${row.originalFilename ?? row.storageKey}`}
              className="inline-flex max-w-[200px] items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-1 pr-1 text-xs"
            >
              {row.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.previewUrl} alt="" className="size-6 rounded-full object-cover" />
              ) : null}
              <span className="truncate">{row.originalFilename || 'Archivo'}</span>
              <button
                type="button"
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                disabled={disabled}
                onClick={() => {
                  const next = value.filter((_, i) => i !== index);
                  if (row.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(row.previewUrl);
                  onChange(next);
                }}
                aria-label={`Quitar ${row.originalFilename || 'adjunto'}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compat: menú de adjuntos + chips (el compositor usa las piezas por separado). */
export function AttachmentUploader(props: AttachmentUploaderProps) {
  return (
    <div className={cn('flex flex-col gap-2', props.className)}>
      <AttachmentPickerTrigger {...props} />
      <AttachmentChips {...props} />
    </div>
  );
}

export function validateAttachmentsForSend(rows: PreparedAttachmentPayload[]): string | undefined {
  for (const r of rows) {
    if (r.contactCitizenId || r.template) continue;
    if (!r.file && !r.storageKey.trim()) return 'Selecciona nuevamente el archivo';
    if (!r.mimeType.trim()) return 'MIME inválido';
    const mime = r.mimeType.split(';')[0].trim().toLowerCase();
    // WhatsApp solo admite vídeo MP4/3GPP de hasta 16 MB en el envío outbound.
    if (mime.startsWith('video/')) {
      if (!VIDEO_MIME_TYPES.includes(mime))
        return 'El vídeo debe ser MP4 o 3GP para enviarlo por WhatsApp';
      if (Number(r.fileSizeBytes) > MAX_VIDEO_BYTES) return 'El vídeo supera 16 MB';
    }
    if (!SIZE_DIGITS.test(r.fileSizeBytes) || r.fileSizeBytes === '0') {
      return 'Tamaño de archivo inválido (bytes > 0)';
    }
  }
  return undefined;
}
