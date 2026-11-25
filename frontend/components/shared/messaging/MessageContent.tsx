'use client';

import { apiClient } from '@/lib/shared/api-client';
import {
  Download,
  ExternalLink,
  FileArchive,
  FileSpreadsheet,
  FileText,
  MapPin,
  Pause,
  Play,
  UserRound,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type {
  MessageAttachmentLike,
  MessageRenderable,
} from '@/components/shared/messaging/MessageBubble';
import { MessageMediaPreviewDialog } from '@/components/shared/messaging/MessageMediaPreviewDialog';

type MediaKind = 'image' | 'audio' | 'video' | 'document' | 'sticker';

function mediaKindFor(kind: string, mime?: string): MediaKind {
  if (kind === 'sticker') return 'sticker';
  if (kind === 'image' || mime?.startsWith('image/')) return 'image';
  if (kind === 'audio' || mime?.startsWith('audio/')) return 'audio';
  if (kind === 'video' || mime?.startsWith('video/')) return 'video';
  return 'document';
}

function PrivateAttachment({
  attachment: a,
  conversationId,
  kind,
}: {
  attachment: MessageAttachmentLike;
  conversationId?: string;
  kind: string;
}) {
  const [url, setUrl] = useState<string | undefined>(() =>
    a.mediaUrl ? safeUrl(a.mediaUrl) : undefined,
  );
  const [downloadUrl, setDownloadUrl] = useState<string | undefined>(() =>
    a.mediaDownloadUrl ? safeUrl(a.mediaDownloadUrl) : undefined,
  );
  const [error, setError] = useState<string>();
  const [requested, setRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const isImage = kind === 'sticker' || a.mimeType?.startsWith('image/') === true;
  const ready = a.processingState === 'stored' && Boolean(conversationId || a.mediaUrl);
  useEffect(() => {
    if (!ready || (!a.mediaUrl && !isImage && !requested)) return;
    const abort = new AbortController();
    let objectUrl: string | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const initialUrl = a.mediaUrl ? safeUrl(a.mediaUrl) : undefined;
    setUrl(initialUrl);
    setDownloadUrl(a.mediaDownloadUrl ? safeUrl(a.mediaDownloadUrl) : undefined);
    setError(a.mediaError ? 'No se pudo cargar el archivo' : undefined);
    const load = async () => {
      try {
        const path = `/conversations/${conversationId}/attachments/${a.id}`;
        const signed = await apiClient.get<
          { legacy: true } | { url: string; downloadUrl: string; expiresAt: string }
        >(`${path}/signed-url`, { signal: abort.signal, cache: 'no-store' });
        if (abort.signal.aborted) return;
        if (!signed.ok) throw new Error(signed.message);
        if ('legacy' in signed.data) {
          const result = await apiClient.getBlob(`${path}/content`, { signal: abort.signal });
          if (abort.signal.aborted) return;
          if (!result.ok) throw new Error(result.message);
          objectUrl = URL.createObjectURL(result.data);
          setUrl(objectUrl);
          setDownloadUrl(objectUrl);
        } else {
          setUrl(signed.data.url);
          setDownloadUrl(signed.data.downloadUrl);
          const refreshIn = Math.max(1000, Date.parse(signed.data.expiresAt) - Date.now() - 60_000);
          refreshTimer = setTimeout(() => void load(), refreshIn);
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          setUrl(undefined);
          setError(error instanceof Error ? error.message : 'No se pudo cargar el archivo');
        }
      }
    };
    // The history already contains these URLs; only renew them near expiry.
    if (initialUrl && attempt === 0) {
      if (a.mediaUrlExpiresAt && conversationId) {
        const refreshIn = Date.parse(a.mediaUrlExpiresAt) - Date.now() - 60_000;
        if (Number.isFinite(refreshIn))
          refreshTimer = setTimeout(() => void load(), Math.max(1000, refreshIn));
      }
    } else if (conversationId && (!a.mediaError || attempt > 0)) {
      void load();
    }
    return () => {
      abort.abort();
      clearTimeout(refreshTimer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    a.id,
    a.mediaUrl,
    a.mediaDownloadUrl,
    a.mediaUrlExpiresAt,
    a.mediaError,
    ready,
    isImage,
    requested,
    conversationId,
    attempt,
  ]);
  const label = a.originalFilename ?? 'Archivo';
  if (!ready)
    return (
      <p className="text-xs" role="status">
        {label} ·{' '}
        {a.processingState === 'failed'
          ? 'Archivo no disponible'
          : a.processingState === 'pending' || a.processingState === 'processing'
            ? 'Procesando archivo…'
            : 'Archivo histórico sin copia disponible'}
      </p>
    );
  if (!url && !requested && !error)
    return (
      <button
        type="button"
        className="min-h-11 rounded px-1 text-xs font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => setRequested(true)}
      >
        Cargar {label}
      </button>
    );
  return (
    <MediaResource
      kind={mediaKindFor(kind, a.mimeType)}
      url={url}
      downloadUrl={downloadUrl}
      mime={a.mimeType}
      filename={label}
      size={a.fileSizeBytes}
      error={error}
      onRetry={
        conversationId
          ? () => {
              setError(undefined);
              setRequested(true);
              setAttempt((value) => value + 1);
            }
          : undefined
      }
    />
  );
}

export function contentRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const text = (value: unknown) => (typeof value === 'string' ? value : '');
function safeUrl(value: string): string | undefined {
  if (value.startsWith('blob:')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function formatFileSize(size?: string | number): string | undefined {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes < 0) return undefined;
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentIcon({ mime }: { mime?: string }) {
  if (mime?.includes('spreadsheet') || mime?.includes('excel'))
    return <FileSpreadsheet aria-hidden />;
  if (mime?.includes('zip') || mime?.includes('compressed')) return <FileArchive aria-hidden />;
  return <FileText aria-hidden />;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function unavailableMessage(kind: MediaKind): string {
  if (kind === 'audio')
    return 'No se pudo reproducir el audio. El navegador puede no admitir este formato.';
  if (kind === 'video') return 'No se pudo cargar el video.';
  return 'No se pudo cargar el archivo.';
}

function MediaDownloadAction({ href, filename }: { href: string; filename?: string }) {
  return (
    <a
      href={href}
      download={filename}
      aria-label={`Descargar ${filename || 'archivo'}`}
      title="Descargar archivo"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Download className="size-4" aria-hidden />
    </a>
  );
}

export function MediaResource({
  url,
  downloadUrl,
  kind,
  filename,
  mime,
  size,
  presentation = 'default',
  error: externalError,
  onRetry,
}: {
  url?: string;
  downloadUrl?: string;
  kind: MediaKind | string;
  filename?: string;
  mime?: string;
  size?: string | number;
  presentation?: 'default' | 'template-header';
  error?: string;
  onRetry?: () => void;
}) {
  const [src, setSrc] = useState<string>();
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    setSrc(url ? safeUrl(url) : undefined);
    setLoadError(!url || !safeUrl(url));
    setLoaded(false);
    setPreviewOpen(false);
    setDuration(0);
    setCurrentTime(0);
    setPlaying(false);
  }, [url]);
  const mediaKind = mediaKindFor(kind, mime);
  const error = externalError || loadError;
  const reservedSize =
    presentation === 'template-header'
      ? 'h-48 w-full'
      : mediaKind === 'sticker'
        ? 'w-40 h-40'
        : mediaKind === 'image'
          ? 'w-72 h-56'
          : mediaKind === 'video'
            ? 'w-72 aspect-video'
            : mediaKind === 'audio'
              ? 'w-72 h-24'
              : 'w-64 min-h-36';
  if (error)
    return (
      <div
        className={`${reservedSize} max-w-full rounded-xl border border-dashed border-border/80 p-3 text-xs`}
      >
        <p>{filename}</p>
        <p role="alert">{externalError || unavailableMessage(mediaKind)}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 min-h-8 rounded px-1 font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Reintentar
          </button>
        )}
      </div>
    );
  if (!src)
    return (
      <p role="status" className={`${reservedSize} max-w-full`}>
        Cargando archivo…
      </p>
    );
  if (mediaKind === 'image' || mediaKind === 'sticker')
    return (
      <div
        className={`group relative max-w-full ${
          presentation === 'template-header'
            ? 'h-48 w-full'
            : mediaKind === 'sticker'
              ? 'h-40 w-40'
              : 'h-56 w-72'
        }`}
      >
        {!loaded && (
          <span role="status" className="text-xs">
            Cargando imagen…
          </span>
        )}
        <button
          type="button"
          aria-label={mediaKind === 'sticker' ? 'Ampliar sticker' : 'Ampliar imagen'}
          className={`block h-full w-full cursor-zoom-in focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${presentation === 'template-header' ? '' : mediaKind === 'sticker' ? '' : 'rounded-xl bg-muted/30'}`}
          onClick={() => setPreviewOpen(true)}
        >
          <Image
            unoptimized={true}
            src={src}
            alt={filename || (mediaKind === 'sticker' ? 'Sticker' : 'Imagen adjunta')}
            width={640}
            height={480}
            loading="lazy"
            className={`h-full w-full ${presentation === 'template-header' ? 'max-h-none object-cover' : 'object-contain'} ${mediaKind === 'sticker' ? '' : 'rounded-xl'}`}
            onLoad={() => setLoaded(true)}
            onError={() => setLoadError(true)}
          />
        </button>
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <MediaDownloadAction
            href={(downloadUrl && safeUrl(downloadUrl)) || src}
            filename={filename}
          />
        </div>
        <MessageMediaPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          src={src}
          downloadUrl={downloadUrl ? safeUrl(downloadUrl) : undefined}
          filename={filename}
          kind="image"
        />
      </div>
    );
  if (mediaKind === 'audio')
    return (
      <div className="flex w-72 max-w-full items-center gap-3 rounded-2xl bg-background/15 px-2 py-2">
        {!loaded && (
          <span role="status" className="sr-only">
            Cargando audio…
          </span>
        )}
        <audio
          ref={audio}
          preload="metadata"
          src={src}
          onLoadedMetadata={(event) => {
            setDuration(
              Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
            );
            setLoaded(true);
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrentTime(0);
          }}
          onError={() => setLoadError(true)}
        />
        <button
          type="button"
          aria-label={playing ? 'Pausar audio' : 'Reproducir audio'}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => {
            const element = audio.current;
            if (!element) return;
            if (element.paused) void element.play().catch(() => setLoadError(true));
            else element.pause();
          }}
        >
          {playing ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="ml-0.5 size-4" aria-hidden />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <input
            type="range"
            aria-label="Progreso del audio"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            disabled={!duration}
            className="h-1 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
            onChange={(event) => {
              const element = audio.current;
              const next = Number(event.target.value);
              if (!element || !Number.isFinite(next)) return;
              element.currentTime = next;
              setCurrentTime(next);
            }}
          />
          <p className="mt-1 flex justify-between text-[11px] tabular-nums opacity-75">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </p>
        </div>
        <MediaDownloadAction
          href={(downloadUrl && safeUrl(downloadUrl)) || src}
          filename={filename}
        />
      </div>
    );
  if (mediaKind === 'video')
    return (
      <div className="group relative w-72 max-w-full overflow-hidden rounded-xl bg-black">
        <button
          type="button"
          aria-label={`Abrir video ${filename || ''}`.trim()}
          className="relative block aspect-video w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          onClick={() => setPreviewOpen(true)}
        >
          <video
            preload="metadata"
            muted
            playsInline
            src={src}
            aria-label={`Vista previa de video ${filename || ''}`.trim()}
            className="pointer-events-none h-full w-full object-contain"
            onLoadedMetadata={(event) => {
              setDuration(
                Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
              );
              setLoaded(true);
            }}
            onError={() => setLoadError(true)}
          />
          <span className="absolute inset-0 grid place-items-center bg-black/15">
            <span className="grid size-12 place-items-center rounded-full bg-background/90 text-foreground shadow-lg transition-transform group-hover:scale-110">
              <Play className="ml-0.5 size-5" aria-hidden />
            </span>
          </span>
          {duration > 0 && (
            <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {formatDuration(duration)}
            </span>
          )}
        </button>
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <MediaDownloadAction
            href={(downloadUrl && safeUrl(downloadUrl)) || src}
            filename={filename}
          />
        </div>
        <MessageMediaPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          src={src}
          downloadUrl={downloadUrl ? safeUrl(downloadUrl) : undefined}
          filename={filename}
          kind="video"
        />
      </div>
    );
  const previewable = mime === 'application/pdf';
  const formattedSize = formatFileSize(size);
  return (
    <>
      <div className="flex w-72 max-w-full gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 shadow-sm">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
          <DocumentIcon mime={mime} />
        </div>
        <div className="min-w-0 space-y-1.5">
          {previewable ? (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="line-clamp-2 text-left font-medium leading-snug hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {filename || 'Documento'}
            </button>
          ) : (
            <p className="break-all font-medium leading-snug line-clamp-2">
              {filename || 'Documento'}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {[mime, formattedSize].filter(Boolean).join(' · ') || 'Archivo adjunto'}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
            {previewable && (
              <button
                type="button"
                className="min-h-8 cursor-pointer underline underline-offset-2"
                onClick={() => setPreviewOpen(true)}
              >
                Previsualizar
              </button>
            )}
            <MediaDownloadAction
              href={(downloadUrl && safeUrl(downloadUrl)) || src}
              filename={filename}
            />
          </div>
        </div>
      </div>
      {previewable && (
        <MessageMediaPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          src={src}
          downloadUrl={downloadUrl ? safeUrl(downloadUrl) : undefined}
          filename={filename}
          kind="document"
        />
      )}
    </>
  );
}

export function TemplateContent({
  snapshot,
  fallback,
  hideMedia = false,
}: {
  snapshot: unknown;
  fallback?: string;
  hideMedia?: boolean;
}) {
  const data = contentRecord(snapshot);
  const components = Array.isArray(data.components)
    ? data.components.map(contentRecord)
    : Array.isArray(data.resolved)
      ? data.resolved.map(contentRecord)
      : [];
  const values = contentRecord(data.values);
  const interpolate = (value: unknown, component: string) =>
    text(value).replace(
      /\{\{([^{}]+)\}\}/g,
      (token, key: string) => text(values[`${component}.${key}`]) || token,
    );
  return (
    <div className="min-w-0 overflow-hidden bg-white font-[Segoe_UI,Helvetica_Neue,Helvetica,Roboto,Arial,sans-serif] text-[#111b21] wrap-anywhere">
      {!components.length && (
        <>
          <p className="whitespace-pre-wrap">{fallback || 'Plantilla'}</p>
          <p className="text-xs opacity-70">Representación histórica parcial</p>
        </>
      )}
      {data.schemaVersion === 1 && data.incomplete !== false && (
        <p className="text-xs opacity-75">Representación histórica incompleta</p>
      )}
      {components.map((component, index) => {
        const type = text(component.type).toLowerCase();
        const format = text(component.format).toLowerCase();
        if (type === 'buttons')
          return (
            <div key={index} className="border-t border-[#e9edef]">
              {(Array.isArray(component.buttons) ? component.buttons : []).map((button, i) => {
                const b = contentRecord(button);
                const buttonText = text(b.text);
                const url =
                  b.type === 'URL' ? safeUrl(interpolate(b.url, `button.${i}`)) : undefined;
                const isLocation = /ubicaci[oó]n/i.test(buttonText);
                const Icon = isLocation ? MapPin : ExternalLink;
                return url ? (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-11 items-center justify-center gap-1.5 px-3 py-2.5 text-center text-sm font-medium text-[#027eb5] hover:bg-[#f5f7f8] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#027eb5]"
                  >
                    <Icon className="size-4" aria-hidden />
                    <span>{buttonText}</span>
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : (
                  <div
                    key={i}
                    className="flex min-h-11 items-center justify-center gap-1.5 px-3 py-2.5 text-center text-sm font-medium text-[#027eb5]"
                    aria-label="Botón informativo de plantilla"
                  >
                    <Icon className="size-4" aria-hidden />
                    <span>{buttonText}</span>
                    {b.type === 'PHONE_NUMBER' && <span>☎ {text(b.phone_number)}</span>}
                  </div>
                );
              })}
            </div>
          );
        return (
          <div
            key={index}
            className={
              type === 'header' && ['image', 'video', 'document'].includes(format)
                ? 'overflow-hidden rounded-t-xl'
                : type === 'body'
                  ? 'px-3 pt-3 text-[14px] leading-[1.4]'
                  : type === 'footer'
                    ? 'px-3 pb-3 pt-2 text-[12px] leading-snug text-[#8696a0]'
                    : 'px-3 pt-3'
            }
          >
            {!hideMedia && type === 'header' && ['image', 'video', 'document'].includes(format) && (
              <MediaResource
                kind={format}
                url={text(contentRecord(data.media).url) || text(values['header.media'])}
                filename={text(contentRecord(data.media).filename)}
                presentation="template-header"
              />
            )}
            {Boolean(component.text) && (
              <p
                className={`whitespace-pre-wrap wrap-break-word ${
                  type === 'header'
                    ? 'font-semibold'
                    : type === 'footer'
                      ? 'text-[12px] text-[#8696a0]'
                      : ''
                }`}
              >
                {interpolate(component.text, type)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContactCard({ contact, outbound }: { contact: unknown; outbound: boolean }) {
  const value = contentRecord(contact);
  const name = contentRecord(value.name);
  const formattedName = text(name.formatted_name) || 'Contacto';
  const phones = Array.isArray(value.phones) ? value.phones.map(contentRecord) : [];
  const phoneNumbers = phones.map((item) => text(item.phone) || text(item.wa_id)).filter(Boolean);

  return (
    <article
      className={`overflow-hidden font-[Segoe_UI,Helvetica_Neue,Helvetica,Roboto,Arial,sans-serif] ${outbound ? 'text-primary-foreground' : 'text-foreground'}`}
    >
      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        <div
          aria-label={`Avatar de ${formattedName}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-current/10 text-current"
        >
          <UserRound className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold leading-[1.2]">{formattedName}</p>
          {phoneNumbers.map((phone, index) => (
            <p
              key={phone}
              className={index === 0 ? 'mt-0.5 text-[12.5px] opacity-70' : 'text-xs opacity-70'}
            >
              {phone}
            </p>
          ))}
        </div>
      </div>
      <div className="mx-3 border-t border-current/15" />
      <button
        type="button"
        className="flex min-h-10 w-full items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-current hover:bg-current/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-current"
      >
        <UserRound className="size-4" aria-hidden />
        Ver contacto
      </button>
    </article>
  );
}

export function MessageContent({ message }: { message: MessageRenderable }) {
  const meta = contentRecord(message.meta);
  const type = text(meta.type) || message.messageType;
  const media = contentRecord(meta.media);
  const context = contentRecord(meta.context);
  const contacts = Array.isArray(meta.contacts) ? meta.contacts : [];
  const attachments = message.attachmentsViaMessageId ?? [];
  // WhatsApp video: la leyenda se renderiza debajo del reproductor, dentro de
  // la misma burbuja; el resto de medios la mantiene en su posición actual.
  const showCaption = Boolean(
    media.caption ||
    (!contacts.length &&
      message.body &&
      !/^\[(?:sticker|audio|document)\]$/i.test(message.body.trim())),
  );
  const captionBlock = showCaption ? (
    <p className="whitespace-pre-wrap wrap-break-word leading-relaxed">
      {text(media.caption) || message.body}
    </p>
  ) : null;
  return (
    <div className="space-y-2">
      {meta.deliveryState === 'uncertain' && (
        <p role="status" className="text-xs">
          Resultado de envío sin confirmar. Requiere revisión antes de reenviar.
        </p>
      )}
      {contacts.map((contact, i) => (
        <ContactCard key={i} contact={contact} outbound={message.direction === 'outbound'} />
      ))}
      {(type === 'unsupported' || message.messageType === 'unsupported') && (
        <p className="text-xs">Contenido no compatible ({text(meta.type) || 'desconocido'})</p>
      )}
      {Boolean(contentRecord(meta.processing).error) && (
        <p role="alert" className="text-xs">
          {text(contentRecord(meta.processing).error)}
        </p>
      )}
      {Boolean(context.id) && (
        <blockquote className="border-l-2 pl-2 text-xs opacity-75">
          Respuesta a {text(context.id)}
        </blockquote>
      )}
      {type === 'template' ? (
        <TemplateContent
          snapshot={{
            ...contentRecord(meta.templateSnapshot),
            media: { ...media, url: message.mediaUrl ?? attachments[0]?.mediaUrl ?? media.url },
          }}
          fallback={message.body}
        />
      ) : (
        <>
          {['image', 'audio', 'video', 'document', 'sticker'].includes(type) &&
            !attachments.length && (
              <MediaResource
                kind={type}
                url={message.mediaUrl ?? text(media.url)}
                mime={text(media.mimeType)}
                filename={text(media.filename)}
              />
            )}
          {type !== 'video' && captionBlock}
          {type === 'location' && (
            <p>
              {text(contentRecord(meta.location ?? meta.content).name)}{' '}
              {String(contentRecord(meta.location ?? meta.content).latitude ?? '')},{' '}
              {String(contentRecord(meta.location ?? meta.content).longitude ?? '')}
            </p>
          )}
        </>
      )}
      {type !== 'template' &&
        attachments.map((attachment) => (
          <PrivateAttachment
            key={attachment.id}
            attachment={attachment}
            conversationId={message.conversationId}
            kind={type}
          />
        ))}
      {type === 'video' && captionBlock}
    </div>
  );
}
