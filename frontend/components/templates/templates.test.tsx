import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TemplateTable } from './TemplateTable';
import { applyTemplateStatus } from './TemplatesPage';
import { VariableEditor } from './VariableEditor';
import { WhatsAppMobilePreview } from '@/components/ui/whatsapp-mobile-preview';
import { createTemplateSseParser } from '@/lib/template-sse';
import {
  canEditTemplate,
  renderTemplateText,
  type MessageTemplate,
  type TemplateStatusUpdate,
} from '@/lib/templates-api';
const rows: MessageTemplate[] = ['1', '2'].map((id) => ({
  id,
  name: `mensaje_${id}`,
  language: 'es',
  category: 'UTILITY',
  status: 'PENDING',
  components: [],
  createdAt: '2026-10-01T12:00:00Z',
  updatedAt: '2026-10-02T12:00:00Z',
}));
const event: TemplateStatusUpdate = {
  id: '3',
  waba_id: '100',
  message_template_id: '1',
  message_template_name: 'mensaje_1',
  event: 'APPROVED',
  occurred_at: '2026-10-13T12:00:00Z',
};
describe('Template table updates', () => {
  it('changes only status and preserves unaffected row identities', () => {
    const next = applyTemplateStatus(rows, event);
    expect(next[1]).toBe(rows[1]);
    expect(next[0]).toEqual({ ...rows[0], status: 'APPROVED' });
    expect(applyTemplateStatus(next, event)).toBe(next);
    expect(applyTemplateStatus(rows, { ...event, message_template_id: 'missing' })).toBe(rows);
  });
  it('memoization renders the changed row only', () => {
    const formatter = vi.spyOn(Intl, 'DateTimeFormat');
    const onAction = vi.fn();
    const { rerender } = render(
      <TemplateTable templates={rows} canUpdate canDelete onAction={onAction} />,
    );
    expect(formatter).toHaveBeenCalledTimes(4);
    formatter.mockClear();
    rerender(
      <TemplateTable
        templates={applyTemplateStatus(rows, event)}
        canUpdate
        canDelete
        onAction={onAction}
      />,
    );
    expect(formatter).toHaveBeenCalledTimes(2);
    // Responsive DOM renders the status in both the mobile card and the desktop row.
    expect(screen.getAllByText('Aprobada').length).toBeGreaterThan(0);
  });
  it('does not permit lossy edits of unsupported buttons', () => {
    expect(
      canEditTemplate({
        ...rows[0],
        components: [
          {
            type: 'BUTTONS',
            buttons: [{ type: 'URL', text: 'Abrir', url: 'https://example.com/{{1}}' }],
          },
        ],
      }),
    ).toBe(false);
  });
});
describe('Variable editor and preview', () => {
  it('renders interactive atomic tokens and handles plain text without executing HTML', () => {
    const onVariable = vi.fn();
    render(
      <VariableEditor
        value={'Hola {{1}} <img src=x>'}
        onChange={vi.fn()}
        onBlur={vi.fn()}
        onVariable={onVariable}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Muestra de {{1}}' }));
    expect(onVariable).toHaveBeenCalledWith('1');
    expect(screen.getByRole('textbox').querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Muestra de {{1}}' }).contentEditable).toBe('false');
  });
  it('does not allow editing in read-only mode', () => {
    render(
      <VariableEditor
        disabled
        value="Hola"
        onChange={vi.fn()}
        onBlur={vi.fn()}
        onVariable={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'false');
  });
  it('renders injected preview text and preserves unresolved tokens', () => {
    render(<WhatsAppMobilePreview body="Hola Ana" lineName="Voz Ciudadana" />);
    expect(screen.getByText('Hola Ana')).toBeInTheDocument();
    const samples: Record<string, string> = { nombre: 'Ana' };
    expect(renderTemplateText('Hola {{nombre}}, de {{ciudad}}', (key) => samples[key] ?? '')).toBe(
      'Hola Ana, de {{ciudad}}',
    );
  });
});
describe('SSE parser', () => {
  it('handles split frames, CRLF and duplicate delivery', () => {
    const receive = vi.fn();
    const parse = createTemplateSseParser(receive);
    const frame = `: heartbeat\r\n\r\nevent: template_status_changed\r\nid: 3\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;
    for (const letter of frame) parse(letter);
    expect(receive).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenCalledWith(event);
    parse('event: other\ndata: {}\n\nevent: template_status_changed\ndata: invalid\n\n');
    expect(receive).toHaveBeenCalledTimes(1);
  });
});
