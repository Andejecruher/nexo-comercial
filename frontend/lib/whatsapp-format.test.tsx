import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WhatsAppMobilePreview } from '@/components/ui/whatsapp-mobile-preview';
import { renderTemplateText } from './templates-api';
import { renderWhatsAppText } from './whatsapp-format';

describe('WhatsApp presentation', () => {
  it('renders inline marks, nesting, variables and emoji without changing source', () => {
    const source = 'Hola *{{nombre}}*, _en ~revisión~_ y *_ambos_* 👩🏽‍💻 y ```código```';
    const resolved = renderTemplateText(source, (key) => (key === 'nombre' ? 'María' : ''));
    const { container } = render(<div>{renderWhatsAppText(resolved)}</div>);
    expect(container.querySelector('strong')).toHaveTextContent('María');
    expect(container.querySelector('em s')).toHaveTextContent('revisión');
    expect(container.querySelector('strong em')).toHaveTextContent('ambos');
    expect(container.querySelector('code')).toHaveTextContent('código');
    expect(container).toHaveTextContent('👩🏽‍💻');
    expect(container).not.toHaveTextContent('*{{nombre}}*');
    expect(source).toContain('*{{nombre}}*');
  });
  it('keeps incomplete, escaped and unsupported syntax literal and safe', () => {
    const { container } = render(
      <div>
        {renderWhatsAppText('Texto *sin cierre y \\_escapado\\_ <img src=x onerror=alert(1)>')}
      </div>,
    );
    expect(container).toHaveTextContent('*sin cierre');
    expect(container).toHaveTextContent('\\_escapado\\_');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('em')).toBeNull();
  });
  it('renders ordered and unordered lists, quotes, and paragraphs', () => {
    const { container } = render(
      <div>
        {renderWhatsAppText('1. Uno\n2. Dos 🥳\n\n- {{x}}\n- Cuatro\n> *Importante*\nFin')}
      </div>,
    );
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelector('blockquote strong')).toHaveTextContent('Importante');
    expect(container).toHaveTextContent('Fin');
  });
  it('keeps a multiline monospace block opaque to list and emphasis parsing', () => {
    const { container } = render(
      <div>{renderWhatsAppText('Inicio\n```1. *literal*\n- segundo```\nFin')}</div>,
    );
    expect(container.querySelector('pre code')?.textContent).toBe('1. *literal*\n- segundo');
    expect(container.querySelector('pre strong')).toBeNull();
    expect(container.querySelector('ol')).toBeNull();
    expect(container).toHaveTextContent('Fin');
  });
  it('keeps the shared preview props for media, footer and buttons', () => {
    render(
      <WhatsAppMobilePreview
        body="*Hola*"
        header="Encabezado"
        footer="Pie"
        buttons={[{ text: 'Abrir' }]}
      />,
    );
    const preview = screen.getByRole('region', { name: 'Vista previa móvil' });
    expect(within(preview).getByText('Hola').tagName).toBe('STRONG');
    expect(within(preview).getByText('Encabezado')).toBeInTheDocument();
    expect(within(preview).getByText('Pie')).toBeInTheDocument();
    expect(within(preview).getByText('Abrir')).toBeInTheDocument();
  });
});
