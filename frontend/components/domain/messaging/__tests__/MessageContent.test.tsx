import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageContent, TemplateContent } from '../MessageContent';
import { messageDay, messageDayLabel } from '@/lib/message-dates';
import type { MessageRenderable } from '../MessageBubble';
const base: MessageRenderable = {
  id: '00000000-0000-4000-8000-000000000001',
  direction: 'inbound',
  body: '',
  messageType: 'text',
  createdAt: '2026-10-18T01:00:00Z',
  meta: {},
};

describe('multimedia content', () => {
  it('renders shared contacts as a WhatsApp-style contact card', () => {
    render(
      <MessageContent
        message={{
          ...base,
          meta: {
            contacts: [
              {
                name: { formatted_name: 'ANTONIO DE JESÚS CRUZ HERNÁNDEZ' },
                phones: [{ wa_id: '5213223188252' }],
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText('ANTONIO DE JESÚS CRUZ HERNÁNDEZ')).toHaveClass('font-semibold');
    expect(screen.getByText('5213223188252')).toHaveClass('opacity-70');
    expect(screen.getByRole('button', { name: 'Ver contacto' })).toBeDefined();
    expect(screen.getByLabelText('Avatar de ANTONIO DE JESÚS CRUZ HERNÁNDEZ')).toBeDefined();
  });

  it.each(['image', 'sticker'])(
    'renders %s without converting its animation and reports load errors',
    (kind) => {
      render(
        <MessageContent
          message={{
            ...base,
            messageType: kind,
            meta: { media: { url: 'https://media.test/original.webp', animated: true } },
          }}
        />,
      );
      const image = screen.getByRole('img');
      expect(image.getAttribute('src')).toBe('https://media.test/original.webp');
      fireEvent.error(image);
      expect(screen.getByText('No se pudo cargar el archivo.')).toBeDefined();
    },
  );
  it('provides an accessible custom audio player without native controls or a redundant voice-note label', () => {
    const { container } = render(
      <MessageContent
        message={{
          ...base,
          messageType: 'audio',
          meta: { media: { url: 'https://media.test/audio.ogg', voice: true } },
        }}
      />,
    );
    expect(screen.queryByText('Nota de voz')).toBeNull();
    expect(container.querySelector('audio')?.controls).toBe(false);
    expect(screen.getByRole('button', { name: 'Reproducir audio' })).toBeDefined();
    expect(screen.getByLabelText('Progreso del audio')).toBeDefined();
  });
  it('opens a PDF preview in an application modal and keeps unknown documents downloadable', async () => {
    render(
      <MessageContent
        message={{
          ...base,
          messageType: 'document',
          attachmentsViaMessageId: [
            {
              id: '1',
              mimeType: 'application/pdf',
              fileSizeBytes: '512',
              originalFilename: 'report.pdf',
              mediaUrl: 'https://storage.googleapis.com/signed-document',
              processingState: 'stored',
            },
          ],
        }}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Previsualizar' }));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByTitle('Vista previa de report.pdf')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Descargar archivo' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Abrir en una nueva pestaña' })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(screen.getByText(/512 bytes/)).toBeDefined();
  });
  it('opens an image in the application preview instead of a new browser tab', () => {
    render(
      <MessageContent
        message={{
          ...base,
          messageType: 'image',
          meta: { media: { url: 'https://media.test/photo.webp', filename: 'photo.webp' } },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ampliar imagen' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(within(dialog).getByAltText('photo.webp')).toBeDefined();
  });
  it.each(['[sticker]', '[audio]', '[document]'])(
    'does not render the redundant %s media body',
    (body) => {
      render(
        <MessageContent
          message={{
            ...base,
            body,
            messageType: 'document',
            meta: { media: { url: 'https://media.test/report.pdf', mimeType: 'application/pdf' } },
          }}
        />,
      );

      expect(screen.queryByText(body)).toBeNull();
    },
  );
  it('uses the history mediaUrl directly for an audio message without attachments', () => {
    const url = 'https://storage.googleapis.com/signed-audio';
    const view = render(
      <MessageContent message={{ ...base, messageType: 'audio', mediaUrl: url, meta: {} }} />,
    );
    expect(view.container.querySelector('audio')?.src).toBe(url);
  });
  it('rejects unsafe media schemes', () => {
    render(
      <MessageContent
        message={{ ...base, messageType: 'image', meta: { media: { url: 'javascript:alert(1)' } } }}
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('No se pudo cargar el archivo.')).toBeDefined();
  });
  it('renders a WhatsApp-style template card with media, footer, and a location CTA', async () => {
    render(
      <TemplateContent
        snapshot={{
          name: 'hello',
          language: 'es_MX',
          values: { 'header.1': 'Ana', 'body.name': 'Ana', 'button.0.1': 'token' },
          media: { url: 'https://media.test/gnp-banner.jpg', filename: 'GNP Seguros' },
          components: [
            { type: 'HEADER', format: 'IMAGE' },
            { type: 'BODY', text: 'Hola {{name}}' },
            { type: 'FOOTER', text: 'Gracias' },
            {
              type: 'BUTTONS',
              buttons: [
                { type: 'URL', text: 'Ver ubicación', url: 'https://test/{{1}}' },
                { type: 'QUICK_REPLY', text: 'Sí' },
              ],
            },
          ],
        }}
      />,
    );

    const image = await screen.findByRole('img', { name: 'GNP Seguros' });
    expect(image).toHaveClass('object-cover');
    expect(screen.getByText('Hola Ana')).toBeDefined();
    expect(screen.getByText('Gracias')).toHaveClass('text-[12px]');
    expect(screen.getByRole('link', { name: /Ver ubicación/ })).toHaveAttribute(
      'href',
      'https://test/token',
    );
    expect(screen.getByText('Sí')).toBeDefined();
  });
  it('does not invent missing historical template content', () => {
    render(<TemplateContent snapshot={undefined} fallback="Plantilla anterior" />);
    expect(screen.getByText('Representación histórica parcial')).toBeDefined();
  });
  it('opens an outbound video in the preview dialog and keeps its caption below the compact preview', async () => {
    render(
      <MessageContent
        message={{
          ...base,
          direction: 'outbound',
          messageType: 'video',
          body: 'A succulent eclipse!',
          conversationId: 'conv-1',
          meta: {
            media: {
              id: 'media-1',
              caption: 'A succulent eclipse!',
              mimeType: 'video/mp4',
              filename: 'eclipse.mp4',
            },
          },
          attachmentsViaMessageId: [
            {
              id: 'att-1',
              mimeType: 'video/mp4',
              fileSizeBytes: '1024',
              originalFilename: 'eclipse.mp4',
              mediaUrl: 'https://storage.googleapis.com/signed-video',
              processingState: 'stored',
            },
          ],
        }}
      />,
    );
    const videoButton = await screen.findByRole('button', { name: 'Abrir video eclipse.mp4' });
    const compactVideo = within(videoButton).getByLabelText('Vista previa de video eclipse.mp4');
    expect(compactVideo.getAttribute('src')).toBe('https://storage.googleapis.com/signed-video');
    expect((compactVideo as HTMLVideoElement).controls).toBe(false);
    fireEvent.click(videoButton);

    const dialog = screen.getByRole('dialog');
    const player = within(dialog).getByLabelText('Video eclipse.mp4');
    expect((player as HTMLVideoElement).controls).toBe(true);
    expect(within(dialog).getByRole('link', { name: 'Descargar archivo' })).toHaveAttribute(
      'download',
    );

    const caption = screen.getByText('A succulent eclipse!');
    expect(
      videoButton.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('message dates', () => {
  it('uses the application timezone across UTC midnight and invalid timestamps', () => {
    expect(messageDay('2026-10-18T01:00:00Z')).toBe(messageDay('2026-10-17T23:00:00Z'));
    expect(messageDayLabel('2026-10-18T01:00:00Z', new Date('2026-10-18T02:00:00Z'))).toBe('Hoy');
    expect(messageDayLabel('bad')).toBe('Fecha desconocida');
  });
});
