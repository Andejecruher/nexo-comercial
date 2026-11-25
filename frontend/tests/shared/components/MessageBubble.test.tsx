import { MessageBubble, type MessageRenderable } from '@/components/shared/messaging/MessageBubble';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const ME_ID = 'user-me';

function message(overrides: Partial<MessageRenderable> = {}): MessageRenderable {
  return {
    id: 'msg-1',
    body: 'Mensaje de prueba',
    direction: 'outbound',
    messageType: 'text',
    createdAt: '2026-09-20T18:05:00.000Z',
    sendByUserId: null,
    sender: null,
    meta: {},
    statuses: [],
    attachmentsViaMessageId: [],
    ...overrides,
  };
}

function sender(fullName: string | null, id = 'user-agent', email = 'agente@test.com') {
  return { id, fullName, email };
}

describe('MessageBubble — resolución de remitente', () => {
  it('inbound no muestra nombre: el ciudadano ya está en el encabezado', () => {
    render(<MessageBubble message={message({ direction: 'inbound', body: 'Sin agua ayer' })} />);
    expect(screen.getByText('Sin agua ayer')).toBeDefined();
    expect(screen.queryByText('Ciudadano')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('outbound con sender propio → etiqueta "Tú" y tooltip con email', async () => {
    render(
      <MessageBubble
        message={message({ sender: sender('Ana García', ME_ID, 'ana@test.com') })}
        currentUserId={ME_ID}
      />,
    );
    fireEvent.pointerMove(screen.getByRole('button'));
    expect((await screen.findAllByText('Tú — ana@test.com')).length).toBeGreaterThan(0);
  });

  it('outbound con otro sender → nombre completo y tooltip con email', async () => {
    render(
      <MessageBubble
        message={message({ sender: sender('Luis Pérez', 'user-1', 'luis@test.com') })}
        currentUserId={ME_ID}
      />,
    );
    fireEvent.pointerMove(screen.getByRole('button'));
    expect((await screen.findAllByText('luis@test.com')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Tú —/)).toBeNull();
  });

  it('sender sin fullName → fallback "Agente" sin tooltip (no email)', () => {
    render(
      <MessageBubble
        message={message({ sender: sender(null, 'user-1', undefined) })}
        currentUserId={ME_ID}
      />,
    );
    expect(screen.getByText('Agente')).toBeDefined();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('outbound sin sender → "Bot IA" con el mismo diseño que un agente', () => {
    render(
      <MessageBubble
        message={message({ sender: null, sendByUserId: null, body: '¿Cómo ayudarte?' })}
      />,
    );
    expect(screen.getByText('Bot IA')).toBeDefined();
    const bubbleDiv = screen.getByText('¿Cómo ayudarte?').closest('.rounded-2xl');
    expect(bubbleDiv?.getAttribute('class')).toContain('bg-primary');
    expect(bubbleDiv?.getAttribute('class')).not.toContain('bg-violet-600');
    expect(screen.queryByRole('button', { name: 'Bot IA' })).toBeNull();
  });

  it('Bot IA muestra en el tooltip el agente que generó el mensaje', async () => {
    render(
      <MessageBubble
        message={message({
          sender: null,
          sendByUserId: null,
          meta: { source: 'ai', aiAgentName: 'Asistente municipal' },
        })}
      />,
    );
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Bot IA' }));
    expect((await screen.findAllByText('Asistente municipal')).length).toBeGreaterThan(0);
  });
});

describe('MessageBubble — contenido y extras', () => {
  it('no utiliza una URL CDN arbitraria para reproducir archivos históricos', () => {
    const { container } = render(
      <MessageBubble
        message={message({
          messageType: 'audio',
          attachmentsViaMessageId: [
            {
              id: 'att-1',
              cdnUrl: 'https://untrusted.test/audio.mp3',
              originalFilename: 'audio.mp3',
            },
          ],
        })}
      />,
    );
    expect(screen.queryByText('Audio')).toBeNull();
    expect(container.querySelector('audio')).toBeNull();
    expect(screen.getByText(/Archivo histórico sin copia disponible/)).toBeDefined();
  });

  it('los adjuntos con enlaces externos conservan el nombre sin exponer el enlace', () => {
    render(
      <MessageBubble
        message={message({
          attachmentsViaMessageId: [
            { id: 'att-1', cdnUrl: 'javascript:alert(1)', originalFilename: 'reporte.pdf' },
          ],
        })}
      />,
    );
    expect(screen.getByText(/reporte.pdf/)).toBeDefined();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('adjunto sin cdnUrl muestra nombre del archivo como texto', () => {
    render(
      <MessageBubble
        message={message({
          direction: 'inbound',
          attachmentsViaMessageId: [
            { id: 'att-1', storageKey: 'key/123', originalFilename: 'doc.pdf' },
          ],
        })}
      />,
    );
    expect(screen.getByText(/doc.pdf/)).toBeDefined();
  });
});

describe('MessageBubble — estados y timestamp', () => {
  it('outbound muestra icono de estado entregado (doble check)', () => {
    render(
      <MessageBubble
        message={message({
          direction: 'outbound',
          statuses: [{ status: 'delivered', timestamp: '2026-09-20T18:06:00.000Z' }],
        })}
      />,
    );
    const tick = screen.getByText('Entregado');
    expect(tick.getAttribute('class')).toContain('sr-only');
    expect(screen.queryByText('Pendiente de entrega')).toBeNull();
  });

  it('leído renderiza el doble check en color celeste', () => {
    render(
      <MessageBubble
        message={message({
          direction: 'outbound',
          statuses: [{ status: 'read', timestamp: '2026-09-20T18:07:00.000Z' }],
        })}
      />,
    );
    const indicator = screen.getByText('Leído').parentElement;
    const icon = indicator?.querySelector('svg');
    expect(icon?.getAttribute('class')).toContain('text-sky-400');
  });

  it('outbound sin estados → reloj de pendiente', () => {
    render(<MessageBubble message={message({ direction: 'outbound', statuses: [] })} />);
    expect(screen.getByText('Pendiente de entrega')).toBeDefined();
  });

  it('inbound nunca muestra iconos de estado', () => {
    render(<MessageBubble message={message({ direction: 'inbound', statuses: [] })} />);
    expect(screen.queryByText('Entregado')).toBeNull();
    expect(screen.queryByText('Pendiente de entrega')).toBeNull();
  });

  it('timestamp por defecto es hora (HH:mm)', () => {
    render(<MessageBubble message={message()} />);
    const ts = new Date('2026-09-20T18:05:00.000Z').toLocaleTimeString('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByText(ts)).toBeDefined();
  });

  it('timestamp en modo datetime incluye fecha y hora', () => {
    render(<MessageBubble message={message()} timestamp="datetime" />);
    const d = new Date('2026-09-20T18:05:00.000Z');
    const expected = `${d.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit' })} · ${d.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })}`;
    expect(screen.getByText(expected)).toBeDefined();
  });
});

describe('MessageBubble — mensajes de sistema', () => {
  it('se centran y no muestran remitente ni estados', () => {
    const { container } = render(
      <MessageBubble
        message={message({
          messageType: 'system',
          sender: null,
          body: 'Conversación transferida a un agente',
        })}
      />,
    );
    const root = container.firstElementChild;
    expect(root?.getAttribute('class')).toContain('justify-center');
    expect(screen.getByText('Conversación transferida a un agente')).toBeDefined();
    expect(screen.queryByText('Bot IA')).toBeNull();
    expect(screen.queryByText('Pendiente de entrega')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('usa el icono de transferencia cuando meta.kind es "transfer"', () => {
    const { container } = render(
      <MessageBubble
        message={message({
          messageType: 'system',
          meta: { kind: 'transfer', targetType: 'agent', toState: 'HUMAN_FLOW' },
        })}
      />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('muestra la hora dentro de la píldora', () => {
    render(
      <MessageBubble message={message({ messageType: 'system', body: 'Asistente reactivado…' })} />,
    );
    const ts = new Date('2026-09-20T18:05:00.000Z').toLocaleTimeString('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByText(ts)).toBeDefined();
  });
});

describe('MessageBubble — layout de burbuja y pie', () => {
  it('renders stickers without the regular bubble background or shadow', () => {
    render(
      <MessageBubble
        message={message({
          direction: 'inbound',
          body: '[sticker]',
          messageType: 'sticker',
          meta: { media: { url: 'https://media.test/sticker.webp', filename: 'sticker.webp' } },
        })}
      />,
    );

    const sticker = screen.getByAltText('sticker.webp');
    const bubble = sticker.closest('.rounded-2xl');
    expect(bubble?.getAttribute('class')).toContain('bg-transparent');
    expect(bubble?.getAttribute('class')).toContain('shadow-none');
    expect(screen.queryByText('[sticker]')).toBeNull();
  });

  it('outbound ancla la raíz a la derecha con w-fit y tope de 80%', () => {
    const { container } = render(<MessageBubble message={message({ body: 'Ok', sender: null })} />);
    const root = container.firstElementChild;
    expect(root?.getAttribute('class')).toContain('self-end');
    expect(root?.getAttribute('class')).toContain('w-fit');
    expect(root?.getAttribute('class')).toContain('max-w-[80%]');
  });

  it('inbound ancla la raíz a la izquierda', () => {
    const { container } = render(
      <MessageBubble message={message({ direction: 'inbound', body: 'Hola' })} />,
    );
    expect(container.firstElementChild?.getAttribute('class')).toContain('self-start');
  });

  it('nombre y hora no se parten en el pie', () => {
    render(
      <MessageBubble
        message={message({
          body: 'Ok',
          sender: sender('Super Administrador', ME_ID),
        })}
        currentUserId={ME_ID}
      />,
    );
    expect(screen.getByText('Super Administrador').getAttribute('class')).toContain(
      'whitespace-nowrap',
    );
    const ts = new Date('2026-09-20T18:05:00.000Z').toLocaleTimeString('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByText(ts).getAttribute('class')).toContain('whitespace-nowrap');
  });
});

describe('MessageBubble — reacciones', () => {
  it('renderiza el badge con el emoji sobre el mensaje existente', () => {
    render(
      <MessageBubble
        message={message({
          body: 'Mensaje reaccionado',
          meta: { reaction: { emoji: '👍', from: '529612345678', updated_at: '1700000000' } },
        })}
      />,
    );

    const badge = screen.getByRole('img', { name: 'Reacción: 👍' });
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe('👍');
    // El emoji va sobre la burbuja original, nunca como mensaje propio.
    expect(screen.getAllByText('Mensaje reaccionado')).toHaveLength(1);
  });

  it('no renderiza badge cuando el emoji es null (reacción retirada)', () => {
    render(
      <MessageBubble
        message={message({
          meta: { reaction: { emoji: null, from: '529612345678', updated_at: '1700000000' } },
        })}
      />,
    );

    expect(screen.queryByRole('img', { name: /Reacción/ })).toBeNull();
  });

  it('no renderiza badge cuando meta.reaction no existe', () => {
    render(<MessageBubble message={message({ meta: {} })} />);

    expect(screen.queryByRole('img', { name: /Reacción/ })).toBeNull();
  });

  it('posiciona el badge en la esquina opuesta a la cola según la dirección', () => {
    const { container: inbound } = render(
      <MessageBubble
        message={message({
          direction: 'inbound',
          meta: { reaction: { emoji: '👍', from: '529612345678', updated_at: '1700000000' } },
        })}
      />,
    );
    const inboundBadge = inbound.querySelector('[role="img"]');
    expect(inboundBadge?.getAttribute('class')).toContain('left-1');

    const { container: outbound } = render(
      <MessageBubble
        message={message({
          direction: 'outbound',
          meta: { reaction: { emoji: '👍', from: '529612345678', updated_at: '1700000000' } },
        })}
      />,
    );
    const outboundBadge = outbound.querySelector('[role="img"]');
    expect(outboundBadge?.getAttribute('class')).toContain('right-1');
  });

  it('no renderiza badge en mensajes de sistema', () => {
    render(
      <MessageBubble
        message={message({
          messageType: 'system',
          body: 'Conversación transferida',
          meta: { reaction: { emoji: '👍', from: '529612345678', updated_at: '1700000000' } },
        })}
      />,
    );

    expect(screen.queryByRole('img', { name: /Reacción/ })).toBeNull();
  });

  it('ignora una reacción malformada sin romper el render', () => {
    render(
      <MessageBubble
        message={message({ meta: { reaction: { emoji: '', from: 'x', updated_at: 'y' } } })}
      />,
    );

    expect(screen.queryByRole('img', { name: /Reacción/ })).toBeNull();
  });
});
