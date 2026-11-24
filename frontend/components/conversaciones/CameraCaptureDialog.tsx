'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Camera, RefreshCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface CameraCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
  onPickFile?: () => void;
}

async function getCameraStream(deviceId?: string): Promise<MediaStream> {
  if (deviceId) {
    return navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false,
    });
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

export function CameraCaptureDialog({
  open,
  onOpenChange,
  onCapture,
  onPickFile,
}: CameraCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!open) {
      setStream(null);
      setReady(false);
      setError(null);
      setDeviceId(undefined);
      setDevices([]);
      return;
    }

    let cancelled = false;
    let active: MediaStream | undefined;

    async function start() {
      setError(null);
      setReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara. Elige una foto desde un archivo.');
        return;
      }
      try {
        active = await getCameraStream(deviceId);
        if (cancelled) {
          active.getTracks().forEach((track) => track.stop());
          return;
        }
        setStream(active);
        const listed = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setDevices(listed.filter((item) => item.kind === 'videoinput'));
        }
      } catch {
        setError(
          'No pudimos acceder a la cámara. Revisa que esté conectada y que el navegador tenga permiso.',
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      active?.getTracks().forEach((track) => track.stop());
    };
  }, [open, deviceId]);

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
    void video.play().catch(() => undefined);
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
        'La cámara no envía imagen. Puede estar en uso por otra aplicación o bloqueada por el navegador.',
      );
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [open, ready, error]);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('La cámara todavía no está lista. Intenta de nuevo en un momento.');
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
          setError('No pudimos generar la foto. Intenta de nuevo.');
          return;
        }
        onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  }, [onCapture]);

  const switchCamera = () => {
    if (devices.length < 2) return;
    const current =
      deviceId ?? stream?.getVideoTracks()[0]?.getSettings().deviceId ?? devices[0]?.deviceId;
    const index = devices.findIndex((item) => item.deviceId === current);
    const next = devices[(index + 1) % devices.length];
    if (next) setDeviceId(next.deviceId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Tomar foto</DialogTitle>
          <DialogDescription>
            Usa la cámara de la computadora o del dispositivo para adjuntar una foto a la
            conversación.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl border bg-black">
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
              <Camera className="size-4" />
              Tomar foto
            </Button>
            {devices.length > 1 && (
              <Button
                variant="outline"
                onClick={switchCamera}
                className="w-full sm:flex-1"
                size="lg"
                type="button"
              >
                <RefreshCcw className="size-4" />
                Cambiar cámara
              </Button>
            )}
            {onPickFile && (
              <Button
                variant="outline"
                onClick={onPickFile}
                className="w-full sm:flex-1"
                size="lg"
                type="button"
              >
                Elegir archivo
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
