import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageContent } from '../MessageContent';
import type { MessageRenderable } from '../MessageBubble';
import { apiClient } from '@/lib/api-client';
vi.mock('@/lib/api-client', () => ({ apiClient: { getBlob: vi.fn(), get: vi.fn() } }));
const message = (extra: Partial<MessageRenderable> = {}): MessageRenderable => ({
  id: 'm',
  conversationId: 'conversation-id',
  body: '',
  direction: 'inbound',
  messageType: 'text',
  meta: {},
  createdAt: '2026-10-17T10:00:00Z',
  ...extra,
});
beforeEach(() => {
  vi.mocked(apiClient.get).mockResolvedValue({ ok: true, data: { legacy: true } });
  vi.mocked(apiClient.getBlob).mockResolvedValue({ ok: true, data: new Blob(['synthetic']) });
  URL.createObjectURL = vi.fn(() => 'blob:private-fixture');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.clearAllMocks());
describe('private conversation content', () => {
  it('loads an image through the authenticated conversation endpoint and revokes its blob URL', async () => {
    const { unmount } = render(
      <MessageContent
        message={message({
          messageType: 'image',
          attachmentsViaMessageId: [
            {
              id: 'attachment-id',
              mimeType: 'image/png',
              processingState: 'stored',
              originalFilename: 'photo.png',
            },
          ],
        })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByAltText('photo.png').getAttribute('src')).toBe('blob:private-fixture'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar imagen' }));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(apiClient.getBlob).toHaveBeenCalledWith(
      '/conversations/conversation-id/attachments/attachment-id/content',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-fixture');
  });
  it('loads audio on demand and offers a download fallback', async () => {
    const { container } = render(
      <MessageContent
        message={message({
          messageType: 'audio',
          meta: { media: { voice: true } },
          attachmentsViaMessageId: [
            {
              id: 'a',
              mimeType: 'audio/ogg',
              processingState: 'stored',
              originalFilename: 'voice.ogg',
            },
          ],
        })}
      />,
    );
    expect(screen.queryByText('Nota de voz')).toBeNull();
    expect(apiClient.getBlob).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar voice.ogg' }));
    await waitFor(() => expect(container.querySelector('audio')).not.toBeNull());
    expect(screen.getByRole('link', { name: /Descargar voice.ogg/ })).toBeDefined();
  });
  it('opens private PDFs in the same preview modal after loading their authenticated blob', async () => {
    render(
      <MessageContent
        message={message({
          messageType: 'document',
          attachmentsViaMessageId: [
            {
              id: 'pdf',
              mimeType: 'application/pdf',
              processingState: 'stored',
              fileSizeBytes: '512',
              originalFilename: 'private-report.pdf',
            },
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cargar private-report.pdf' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Previsualizar' }));

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByTitle('Vista previa de private-report.pdf')).toBeDefined();
  });
  it('never fetches pending, failed or historical external media', () => {
    render(
      <MessageContent
        message={message({
          attachmentsViaMessageId: [
            {
              id: 'a',
              processingState: 'failed',
              cdnUrl: 'https://untrusted.test/token=secret',
              originalFilename: 'file.pdf',
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/Archivo no disponible/)).toBeDefined();
    expect(apiClient.getBlob).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('renders immutable template text as text and historical buttons without executable links', () => {
    const { container } = render(
      <MessageContent
        message={message({
          messageType: 'template',
          meta: {
            templateSnapshot: {
              schemaVersion: 1,
              name: 'notice',
              language: 'es_MX',
              incomplete: false,
              resolved: [
                { type: 'body', text: '<script>alert(1)</script>\nHola Ana' },
                { type: 'buttons', buttons: [{ text: 'Ver', url: 'javascript:alert(1)' }] },
              ],
            },
          },
        })}
      />,
    );
    expect(screen.getByText(/Hola Ana/)).toBeDefined();
    expect(screen.getByText('Ver')).toBeDefined();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('shows all contact cards and phone numbers without triggering contact actions', () => {
    render(
      <MessageContent
        message={message({
          messageType: 'contacts',
          meta: {
            contacts: [
              {
                name: { formatted_name: 'One' },
                phones: [{ phone: '+525555555555' }, { phone: '+525555555556' }],
              },
              { name: { formatted_name: 'Two' } },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText('One')).toBeDefined();
    expect(screen.getByText('Two')).toBeDefined();
    expect(screen.getByText('+525555555556')).toBeDefined();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

it('renders a signed GCS URL without downloading the file through the API', async () => {
  vi.mocked(apiClient.get).mockResolvedValue({
    ok: true,
    data: {
      url: 'https://storage.googleapis.com/signed-image',
      downloadUrl: 'https://storage.googleapis.com/signed-download',
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    },
  });
  const { unmount } = render(
    <MessageContent
      message={message({
        messageType: 'image',
        attachmentsViaMessageId: [
          {
            id: 'a',
            mimeType: 'image/png',
            processingState: 'stored',
            originalFilename: 'gcs.png',
            mediaUrl: 'https://storage.googleapis.com/signed-image',
            mediaDownloadUrl: 'https://storage.googleapis.com/signed-download',
            mediaUrlExpiresAt: new Date(Date.now() + 900000).toISOString(),
          },
        ],
      })}
    />,
  );
  await waitFor(() =>
    expect(screen.getByAltText('gcs.png').getAttribute('src')).toBe(
      'https://storage.googleapis.com/signed-image',
    ),
  );
  expect(apiClient.get).not.toHaveBeenCalled();
  expect(apiClient.getBlob).not.toHaveBeenCalled();
  expect(screen.getByAltText('gcs.png').getAttribute('src')).not.toContain('/_next/image');
  expect(screen.getByRole('link', { name: /Descargar gcs.png/ }).getAttribute('href')).toBe(
    'https://storage.googleapis.com/signed-download',
  );
  unmount();
});

it('renews signed URLs before expiry and cancels renewal on unmount', async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(apiClient.get).mockImplementation(async () => ({
      ok: true,
      data: {
        url: 'https://storage.googleapis.com/image',
        downloadUrl: 'https://storage.googleapis.com/download',
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      },
    }));
    const { unmount } = render(
      <MessageContent
        message={message({
          messageType: 'image',
          attachmentsViaMessageId: [
            {
              id: 'a',
              mimeType: 'image/png',
              processingState: 'stored',
              mediaUrl: 'https://storage.googleapis.com/initial',
              mediaUrlExpiresAt: new Date(Date.now() + 900000).toISOString(),
            },
          ],
        })}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiClient.get).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(840000);
    });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    unmount();
    await vi.advanceTimersByTimeAsync(900000);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
