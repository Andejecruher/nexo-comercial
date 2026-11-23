'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Camera } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface PromovidoCameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
  onBack: () => void;
}

export function PromovidoCameraCapture({
  open,
  onOpenChange,
  onCapture,
  onBack,
}: PromovidoCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStream(null);
      setReady(false);
      setError(null);
      return;
    }
    let cancelled = false;
    let active: MediaStream | undefined;

    async function start() {
      setError(null);
      setReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara. Seleccioná un archivo en su lugar.');
        return;
      }
      try {
        try {
          active = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'environment',
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch {
          active = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (cancelled) {
          active.getTracks().forEach((track) => track.stop());
          return;
        }
        setStream(active);
      } catch {
        setError(
          'No pudimos acceder a la cámara. Revisá los permisos del navegador o seleccioná un archivo.',
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      active?.getTracks().forEach((track) => track.stop());
    };
  }, [open]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.muted = true;
    const markReady = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) return;
      setReady(true);
      setError(null);
    };
    video.addEventListener('loadedmetadata', markReady);
    video.addEventListener('canplay', markReady);
    video.play().catch(() => undefined);
    markReady();
    return () => {
      video.removeEventListener('loadedmetadata', markReady);
      video.removeEventListener('canplay', markReady);
      video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    if (!open || ready || error) return;
    const timer = window.setTimeout(() => {
      setError(
        'La cámara no envía imagen. Puede estar en uso por otra aplicación o estar bloqueada por el navegador.',
      );
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [open, ready, error]);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('La cámara todavía no está lista. Intentá de nuevo en un momento.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('No pudimos procesar la imagen de la cámara.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('No pudimos generar la foto. Intentá de nuevo.');
          return;
        }
        onCapture(new File([blob], `credencial-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  }, [onCapture]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Tomar foto de la credencial</DialogTitle>
          <DialogDescription>
            Encuadrá el frente de la INE y asegurate de que el texto sea legible.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl border bg-muted">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-video w-full bg-black object-cover"
            />
            {!ready && !error && (
              <p
                role="status"
                className="absolute inset-0 flex items-center justify-center text-sm text-white/80"
              >
                Iniciando cámara…
              </p>
            )}
          </div>
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              onClick={takePhoto}
              disabled={!ready}
              className="w-full sm:flex-1"
              size="lg"
              type="button"
            >
              <Camera className="mr-2 h-4 w-4" />
              Tomar foto
            </Button>
            <Button
              variant="outline"
              onClick={onBack}
              className="w-full sm:flex-1"
              size="lg"
              type="button"
            >
              Volver a las opciones
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
