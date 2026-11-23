'use client';

import {
  createExportJob,
  getExportDownloadToken,
  getExportJob,
  getExportsFeatureFlag,
  triggerDownload,
  type ExportModule,
  type ExportJobStatus,
} from '@/lib/exports-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export function useExportJob() {
  const [enabled, setEnabled] = useState<boolean>();
  const [status, setStatus] = useState<ExportJobStatus | 'idle'>('idle');
  const [jobId, setJobId] = useState<string>();
  const downloadHandledRef = useRef(false);

  useEffect(() => {
    void getExportsFeatureFlag().then((result) => setEnabled(result.ok && result.data.enabled));
  }, []);

  useEffect(() => {
    if (!jobId || !['queued', 'processing'].includes(status)) return;
    let active = true;
    const poll = async () => {
      const result = await getExportJob(jobId);
      if (!active) return;
      if (!result.ok) {
        setStatus('failed');
        toast.error(result.message);
        return;
      }
      const nextStatus = result.data.status;
      if (nextStatus === 'failed' || nextStatus === 'expired') {
        toast.error('The export could not be completed.');
        setStatus(nextStatus);
        return;
      }
      if (nextStatus === 'ready') {
        // El job está listo. NO transicionar a `ready` todavía: `status`
        // está en las deps del efecto, así que setStatus limpiaría este
        // efecto (active=false) mientras el token está en vuelo y mataría
        // la descarga. Se obtiene el token y se dispara el download
        // primero; el ref evita triggers duplicados entre iteraciones
        // del interval mientras esperamos el token.
        if (downloadHandledRef.current) {
          setStatus('ready');
          return;
        }
        downloadHandledRef.current = true;
        const tokenResult = await getExportDownloadToken(jobId);
        if (tokenResult.ok) {
          triggerDownload(jobId, tokenResult.data.token);
          toast.success('Exportación completada. La descarga comenzó en tu navegador.');
          setStatus('ready');
        } else {
          toast.error(tokenResult.message);
          setStatus('failed');
        }
        return;
      }
      setStatus(nextStatus);
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [jobId, status]);

  const start = useCallback(async (module: ExportModule, filters: Record<string, unknown>) => {
    const result = await createExportJob(module, filters);
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    downloadHandledRef.current = false;
    setJobId(result.data.jobId);
    setStatus(result.data.status);
    return true;
  }, []);

  return {
    enabled: enabled === true,
    exporting: status === 'queued' || status === 'processing',
    status,
    start,
  };
}
