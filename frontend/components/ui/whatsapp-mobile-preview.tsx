import { cn } from '@/lib/utils';
import { renderWhatsAppText } from '@/lib/whatsapp-format';
import {
  ArrowLeft,
  FileText,
  ImageIcon,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Phone,
  Send,
  Smile,
  Video,
} from 'lucide-react';

export type WhatsAppPreviewMediaKind = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

/**
 * Encabezado multimedia opcional.
 * Cuando `url` está presente se renderiza el archivo; si no, un placeholder
 * con `name` (o un texto por defecto según `kind`).
 */
export interface WhatsAppPreviewMedia {
  kind: WhatsAppPreviewMediaKind;
  url?: string;
  name?: string;
}

/** Shared by the file picker and the message bubble; supports temporary blob URLs. */
export function WhatsAppMediaPreview({ media }: { media: WhatsAppPreviewMedia }) {
  const label =
    media.name ??
    (media.kind === 'VIDEO'
      ? 'Video de encabezado'
      : media.kind === 'IMAGE'
        ? 'Imagen de encabezado'
        : 'Documento adjunto');
  return (
    <div className="flex min-h-28 w-full min-w-0 flex-col items-center justify-center gap-2 rounded bg-slate-100 p-2 text-xs text-slate-500">
      {media.kind === 'IMAGE' && media.url ? (
        // Local blob URLs do not need Next image optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.url} alt={label} className="max-h-48 w-full rounded object-contain" />
      ) : media.kind === 'VIDEO' && media.url ? (
        <video
          src={media.url}
          aria-label={label}
          controls
          playsInline
          preload="metadata"
          className="max-h-48 w-full rounded"
        />
      ) : (
        <>
          {media.kind === 'DOCUMENT' ? <FileText aria-hidden /> : <ImageIcon aria-hidden />}
          <span className="max-w-full break-all text-center">{label}</span>
        </>
      )}
    </div>
  );
}

export interface WhatsAppPreviewButton {
  text: string;
}

export interface WhatsAppMobilePreviewProps {
  /** Nombre de la línea/contacto en la barra superior del chat. */
  lineName?: string;
  /** Texto del encabezado. Se ignora si `media` está presente. */
  header?: string;
  /** Encabezado multimedia; tiene prioridad sobre `header`. */
  media?: WhatsAppPreviewMedia;
  /** Cuerpo del mensaje con las variables ya resueltas por el contenedor. */
  body: string;
  /** Pie de página opcional. */
  footer?: string;
  /** Botones del mensaje (texto plano). */
  buttons?: readonly WhatsAppPreviewButton[];
  /** Hora mostrada dentro de la burbuja. */
  time?: string;
  /** Leyenda descriptiva bajo el dispositivo. */
  caption?: string;
  /** Título de la tarjeta contenedora. */
  title?: string;
  /** Clases adicionales para el contenedor exterior. */
  className?: string;
}

/**
 * Componente de presentación (dumb): simula un teléfono con una conversación de
 * WhatsApp a partir de props ya resueltas. No conoce plantillas, campañas ni
 * variables; el contenedor es responsable de inyectar el texto final.
 */
export function WhatsAppMobilePreview({
  lineName,
  header,
  media,
  body,
  footer,
  buttons,
  time = '12:30 p. m.',
  caption,
  title = 'Vista previa',
  className,
}: WhatsAppMobilePreviewProps) {
  return (
    <section
      aria-label="Vista previa móvil"
      className={cn('rounded-lg border bg-background p-5', className)}
    >
      <h2 className="mb-5 font-semibold">{title}</h2>
      <div className="mx-auto max-w-82.5 overflow-hidden rounded-[38px] border-[9px] border-zinc-800 bg-[#efeae2] text-slate-900 shadow-xl">
        <div className="flex items-center gap-2 bg-[#12806c] px-3 py-5 text-white">
          <ArrowLeft size={18} />
          <span className="rounded-full bg-white/20 p-2">
            <MessageCircle size={18} />
          </span>
          <strong className="flex-1 truncate text-xs">{lineName || 'Voz Ciudadana'}</strong>
          <Video size={17} />
          <Phone size={17} />
          <MoreVertical size={17} />
        </div>
        <div className="min-h-97.5 p-4">
          <div className="overflow-hidden rounded-lg bg-white shadow-sm">
            <div className="space-y-2 p-3">
              {header && !media && (
                <strong className="block wrap-break-word text-sm">{header}</strong>
              )}
              {media && <WhatsAppMediaPreview media={media} />}
              <div className="min-w-0 whitespace-pre-wrap wrap-break-word text-sm leading-relaxed">
                {renderWhatsAppText(body || 'Tu mensaje aparecerá aquí…')}
              </div>
              {footer && <p className="text-xs text-slate-500">{footer}</p>}
              <p className="text-right text-[10px] text-slate-400">{time}</p>
            </div>
            {buttons?.map((button, i) => (
              <div key={i} className="border-t px-3 py-2 text-center text-sm text-blue-600">
                {button.text || 'Texto del botón'}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 bg-[#f0f2f5] p-2">
          <Smile size={20} />
          <div className="flex flex-1 justify-end rounded-full bg-white p-2">
            <Paperclip size={18} />
          </div>
          <span className="rounded-full bg-[#19a884] p-2 text-white">
            <Send size={18} />
          </span>
        </div>
      </div>
      {caption && <p className="mt-4 text-center text-xs text-muted-foreground">{caption}</p>}
    </section>
  );
}
