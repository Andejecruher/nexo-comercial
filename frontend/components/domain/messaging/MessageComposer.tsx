'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { PreparedAttachmentPayload } from '@/hooks/useConversationMessages';
import { cn } from '@/lib/utils';
import { Mic, Send, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AttachmentChips,
  AttachmentPickerTrigger,
  revokeAttachmentPreviews,
  validateAttachmentsForSend,
} from './AttachmentUploader';
import { EmojiPickerButton } from './EmojiPicker';

type ComposerSendResult = void | boolean | { ok?: boolean };

const TEXTAREA_MAX_PX = 128;
const MAX_AUDIO_SECONDS = 120;

export interface MessageComposerProps {
  lineId?: string;
  onSend: (
    text: string,
    attachments: PreparedAttachmentPayload[],
  ) => Promise<ComposerSendResult> | ComposerSendResult;
  onSendAudio?: (file: File, durationSeconds: number) => Promise<ComposerSendResult>;
  disabled?: boolean;
  sending?: boolean;
  className?: string;
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  // Prefer the native WhatsApp voice-note format. WebM/Opus and MP4 remain
  // accepted source formats because the backend converts every recording to OGG Opus.
  const candidates = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function audioExtension(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('aac')) return 'aac';
  return 'webm';
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function isSendOk(result: ComposerSendResult): boolean {
  if (typeof result === 'boolean') return result;
  if (typeof result === 'object' && result !== null && 'ok' in result) return Boolean(result.ok);
  return true;
}

export function MessageComposer({
  onSend,
  onSendAudio,
  disabled,
  sending,
  className,
}: MessageComposerProps) {
  const [draft, setDraft] = useState('');
  const [recordedAudio, setRecordedAudio] = useState<{
    file: File;
    duration: number;
    url: string;
  }>();
  useEffect(
    () => () => {
      if (recordedAudio) URL.revokeObjectURL(recordedAudio.url);
    },
    [recordedAudio],
  );
  const [attachments, setAttachments] = useState<PreparedAttachmentPayload[]>([]);
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const sendOnStopRef = useRef(false);
  const busy = Boolean(disabled || sending);

  const attachmentsRef = useRef(attachments);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => revokeAttachmentPreviews(attachmentsRef.current);
  }, []);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [draft, resizeTextarea]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      recorderRef.current?.stop();
      stopStream();
    };
  }, [clearTimer, stopStream]);

  const submit = useCallback(async () => {
    setLocalError(undefined);
    const ready = attachments;

    const attErr = validateAttachmentsForSend(ready);
    if (attErr) {
      setLocalError(attErr);
      return;
    }

    const text = draft.trim();
    if (!text && ready.length === 0) return;

    const result = await onSend(draft, ready);
    if (!isSendOk(result)) return;

    revokeAttachmentPreviews(attachments);
    setDraft('');
    setAttachments([]);
  }, [attachments, draft, onSend]);

  const finishRecording = useCallback(
    async (blob: Blob, durationSeconds: number) => {
      if (!onSendAudio) return;
      if (blob.size < 256) {
        toast.error('El audio es demasiado corto');
        return;
      }
      const mimeType = blob.type || pickRecorderMime() || 'audio/webm';
      const file = new File([blob], `audio-${Date.now()}.${audioExtension(mimeType)}`, {
        type: mimeType,
      });
      setRecordedAudio({ file, duration: durationSeconds, url: URL.createObjectURL(file) });
    },
    [onSendAudio],
  );

  const stopRecording = useCallback(
    (shouldSend: boolean) => {
      sendOnStopRef.current = shouldSend;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      } else {
        clearTimer();
        stopStream();
        setRecording(false);
      }
    },
    [clearTimer, stopStream],
  );

  const startRecording = useCallback(async () => {
    if (!onSendAudio) {
      toast.error('El envío de audio no está disponible');
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Este navegador no permite grabar audio');
      return;
    }

    const mimeType = pickRecorderMime();
    if (!mimeType) {
      toast.error(
        'Este navegador no graba en un formato compatible. Selecciona un archivo MP3, M4A u OGG/Opus.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      sendOnStopRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
        chunksRef.current = [];
        recorderRef.current = null;
        clearTimer();
        stopStream();
        setRecording(false);
        setElapsed(0);
        if (sendOnStopRef.current) {
          void finishRecording(blob, durationSeconds);
        }
      };

      recorder.start(250);
      setElapsed(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsed(seconds);
        if (seconds >= MAX_AUDIO_SECONDS) {
          stopRecording(true);
        }
      }, 250);
    } catch {
      toast.error('No se pudo acceder al micrófono');
      stopStream();
    }
  }, [clearTimer, finishRecording, onSendAudio, stopRecording, stopStream]);

  const sendPickedAudio = useCallback(
    async (file: File) => {
      if (!onSendAudio) {
        toast.error('El envío de audio no está disponible');
        return;
      }
      setRecordedAudio({ file, duration: 1, url: URL.createObjectURL(file) });
    },
    [onSendAudio],
  );

  const insertEmoji = useCallback((emoji: string) => {
    const el = textareaRef.current;
    if (!el || document.activeElement !== el) {
      setDraft((prev) => `${prev}${emoji}`);
      window.requestAnimationFrame(() => el?.focus());
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setDraft((prev) => `${prev.slice(0, start)}${emoji}${prev.slice(end)}`);
    window.requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }, []);

  const canSend = Boolean(draft.trim() || attachments.length > 0);
  const showMic = Boolean(onSendAudio) && !canSend && !recording;

  return (
    <div className={cn('space-y-2', className)}>
      <AttachmentChips
        value={attachments}
        onChange={setAttachments}
        disabled={busy || recording}
        error={localError}
      />

      {recordedAudio && (
        <div className="flex flex-wrap items-center gap-2 rounded border p-2">
          <audio controls src={recordedAudio.url} />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setRecordedAudio(undefined)}
          >
            Cancelar audio
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              const result = await onSendAudio?.(recordedAudio.file, recordedAudio.duration);
              if (isSendOk(result)) setRecordedAudio(undefined);
            }}
          >
            Enviar audio
          </Button>
        </div>
      )}
      {recording ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2">
          <span className="relative flex size-2.5 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/70" />
            <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
          </span>
          <p className="min-w-14 font-mono text-sm tabular-nums text-foreground" aria-live="polite">
            {formatClock(elapsed)}
          </p>
          <div className="flex h-6 flex-1 items-center gap-0.5 overflow-hidden" aria-hidden>
            {Array.from({ length: 28 }, (_, index) => (
              <span
                key={index}
                className="w-0.5 rounded-full bg-primary/70"
                style={{ height: `${8 + ((index * 7) % 14)}px` }}
              />
            ))}
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
            onClick={() => stopRecording(false)}
            disabled={busy}
            aria-label="Cancelar grabación"
          >
            <Trash2 className="size-4" />
          </button>
          <Button
            type="button"
            size="icon"
            onClick={() => stopRecording(true)}
            disabled={elapsed < 1 || busy}
            className="bg-primary hover:bg-primary-hover text-primary-foreground h-9 w-9 rounded-xl shrink-0"
            aria-label="Enviar audio"
            aria-busy={sending}
          >
            <Send className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          <AttachmentPickerTrigger
            value={attachments}
            onChange={setAttachments}
            disabled={busy}
            onError={setLocalError}
            onPickAudio={onSendAudio ? (file) => void sendPickedAudio(file) : undefined}
          />
          <Textarea
            ref={textareaRef}
            rows={1}
            placeholder="Escribe una respuesta..."
            className="field-sizing-fixed min-h-11 max-h-32 flex-1 resize-none overflow-y-auto py-2.5 text-sm leading-relaxed"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <EmojiPickerButton disabled={busy} onSelect={insertEmoji} />
          {showMic ? (
            <Button
              type="button"
              size="icon"
              onClick={() => void startRecording()}
              disabled={busy}
              className="bg-primary hover:bg-primary-hover text-primary-foreground h-9 w-9 rounded-xl shrink-0"
              aria-label="Grabar audio"
            >
              <Mic className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={() => void submit()}
              disabled={busy || !canSend}
              className="bg-primary hover:bg-primary-hover text-primary-foreground h-9 w-9 rounded-xl shrink-0"
              aria-busy={sending}
              aria-label="Enviar mensaje"
            >
              {sending ? <Square className="size-3 fill-current" /> : <Send className="size-4" />}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
