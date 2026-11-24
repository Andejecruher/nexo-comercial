import { apiClient, type ApiResponse } from '@/lib/shared/api-client';

export type ExportModule = 'citizens';
export type ExportJobStatus = 'queued' | 'processing' | 'ready' | 'failed' | 'expired';
export type ExportJob = {
  id: string;
  module: ExportModule;
  status: ExportJobStatus;
  rowCount?: number;
  driveFileId?: string;
  errorCode?: string;
  expiresAt: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export function createExportJob(
  module: ExportModule,
  filters: Record<string, unknown>,
): Promise<ApiResponse<{ jobId: string; status: ExportJobStatus }>> {
  return apiClient.post(`/exports/${module}`, filters);
}

export function getExportJob(id: string): Promise<ApiResponse<ExportJob>> {
  return apiClient.get(`/exports/${id}`);
}
export function getExportsFeatureFlag(): Promise<ApiResponse<{ enabled: boolean }>> {
  return apiClient.get('/exports/feature-flag');
}
export type ExportDownloadToken = {
  token: string;
  expiresAt: string;
};
export function getExportDownloadToken(id: string): Promise<ApiResponse<ExportDownloadToken>> {
  return apiClient.post(`/exports/${id}/download-token`);
}
export function downloadUrl(id: string, token?: string): string {
  const url = `${apiBase}/api/v1/exports/${id}/download`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

/**
 * Detona la descarga en el navegador creando un <a> oculto con el
 * atributo `download` y disparando un click programático. Es más robusto
 * que `window.location.href`: no navega la pestaña completa, respeta el
 * header `Content-Disposition` del servidor y funciona con URLs cross-origin
 * protegidas por token de un solo uso.
 */
export function triggerDownload(id: string, token?: string): void {
  const href = downloadUrl(id, token);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.rel = 'noopener';
  anchor.download = ''; // sugiere descarga; el servidor envía Content-Disposition
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
