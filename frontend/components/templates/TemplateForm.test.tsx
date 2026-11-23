import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TemplateForm } from './TemplateForm';
import { templatesApi } from '@/lib/templates-api';
import type * as TemplatesModule from '@/lib/templates-api';
vi.mock('@/lib/templates-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TemplatesModule>()),
  templatesApi: {
    create: vi.fn().mockResolvedValue({ id: '1' }),
    edit: vi.fn(),
    uploadSample: vi.fn(),
  },
}));
const lines = [{ id: 'line', wabaId: '100', name: 'Nexo Comercial' }];
describe('Template form submission', () => {
  it('renames a named variable and keeps its sample in the Meta payload and preview', async () => {
    const saved = vi.fn();
    render(
      <TemplateForm
        lines={lines}
        initialLineId="line"
        onBack={vi.fn()}
        onSaved={saved}
        template={{
          id: 'template-1',
          name: 'saludo',
          language: 'es_MX',
          category: 'UTILITY',
          status: 'PENDING',
          parameter_format: 'NAMED',
          components: [
            {
              type: 'BODY',
              text: 'Hola *{{nombre}}*',
              example: { body_text_named_params: [{ param_name: 'nombre', example: 'María' }] },
            },
          ],
        }}
      />,
    );
    expect(screen.queryByLabelText('Nombre de variable')).not.toBeInTheDocument();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Editar {{nombre}}' }));
    const sample = screen.getByLabelText('Muestra de {{nombre}} *') as HTMLInputElement;
    expect(sample).toHaveFocus();
    expect(sample.selectionStart).toBe(0);
    expect(sample.selectionEnd).toBe(sample.value.length);
    fireEvent.click(screen.getByRole('button', { name: 'Editar {{nombre}}' }));
    const input = await screen.findByRole('textbox', { name: 'Nombre de variable inline' });
    fireEvent.input(input, { target: { value: 'ciudadano' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByLabelText('Muestra de {{ciudadano}} *')).toHaveValue('María');
    expect(screen.getByText('María', { selector: 'strong' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith('line'));
    expect(templatesApi.edit).toHaveBeenCalledWith(
      'line',
      'template-1',
      expect.objectContaining({
        body: 'Hola *{{ciudadano}}*',
        examples: { ciudadano: 'María' },
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  it('cancels an upload, ignores its late result, and allows retrying the same file', async () => {
    let finish!: (value: { handle: string }) => void;
    vi.mocked(templatesApi.uploadSample).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = render(
      <TemplateForm lines={lines} initialLineId="line" onBack={vi.fn()} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Encabezado (opcional)'), {
      target: { value: 'IMAGE' },
    });
    const input = screen.getByLabelText(/^Archivo de muestra/);
    const selected = new File(['sample'], 'sample.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [selected] } });
    expect(screen.getByRole('button', { name: 'Publicar plantilla' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar carga' }));
    expect(vi.mocked(templatesApi.uploadSample).mock.calls.at(-1)![2]!.aborted).toBe(true);
    await act(async () => finish({ handle: '4::stale-sample' }));
    expect(
      screen.queryByText('Muestra registrada en Meta. Puedes reemplazarla.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar plantilla' })).toBeEnabled();
    vi.mocked(templatesApi.uploadSample).mockRejectedValueOnce(new Error('Upload interrupted'));
    fireEvent.change(input, { target: { files: [selected] } });
    await screen.findByText('Upload interrupted');
    expect(screen.getByRole('button', { name: 'Publicar plantilla' })).toBeEnabled();
    unmount();
  });

  it('aborts a pending upload on unmount', () => {
    vi.mocked(templatesApi.uploadSample).mockImplementationOnce(() => new Promise(() => {}));
    const { unmount } = render(
      <TemplateForm lines={lines} initialLineId="line" onBack={vi.fn()} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Encabezado (opcional)'), {
      target: { value: 'VIDEO' },
    });
    fireEvent.change(screen.getByLabelText(/^Archivo de muestra/), {
      target: { files: [new File(['bytes'], 'sample.mp4', { type: 'video/mp4' })] },
    });
    const signal = vi.mocked(templatesApi.uploadSample).mock.calls.at(-1)![2]!;
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('keeps a newer upload pending when a cancelled upload finishes late', async () => {
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = vi.fn(() => 'blob:test');
        static revokeObjectURL = vi.fn();
      },
    );
    let finishOld!: (value: { handle: string }) => void;
    let finishNew!: (value: { handle: string }) => void;
    vi.mocked(templatesApi.uploadSample)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishNew = resolve;
          }),
      );
    render(<TemplateForm lines={lines} initialLineId="line" onBack={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Encabezado (opcional)'), {
      target: { value: 'IMAGE' },
    });
    const input = screen.getByLabelText(/^Archivo de muestra/);
    const selected = new File(['sample'], 'sample.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [selected] } });
    expect(screen.getByLabelText('Encabezado (opcional)')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar carga' }));
    fireEvent.change(input, { target: { files: [selected] } });
    await act(async () => finishOld({ handle: '4::stale-sample' }));
    expect(screen.getByRole('button', { name: 'Publicar plantilla' })).toBeDisabled();
    expect(
      screen.queryByText('Muestra registrada en Meta. Puedes reemplazarla.'),
    ).not.toBeInTheDocument();
    await act(async () => finishNew({ handle: '4::fresh-sample' }));
    expect(
      screen.getByText('Muestra registrada en Meta. Puedes reemplazarla.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar plantilla' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Encabezado (opcional)'), { target: { value: 'TEXT' } });
    expect(screen.queryByLabelText(/^Archivo de muestra/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Muestra registrada en Meta. Puedes reemplazarla.'),
    ).not.toBeInTheDocument();
  });

  it('offers accessible formatting controls and contextual configuration help', () => {
    render(<TemplateForm lines={lines} initialLineId="line" onBack={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Aplicar negrita' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar cursiva' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar tachado' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aplicar subrayado' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insertar código' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lista numerada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lista desordenada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cita' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insertar emoji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insertar variable' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Más información sobre Categoría' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Más información sobre Idioma' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Más información sobre Formato de variables' }),
    ).toBeInTheDocument();
  });

  it('inserts formatting, emojis, and variables at the current editor selection', () => {
    render(<TemplateForm lines={lines} initialLineId="line" onBack={vi.fn()} onSaved={vi.fn()} />);
    const body = screen.getByRole('textbox', { name: 'Cuerpo' });
    body.textContent = 'Hola';
    fireEvent.input(body);

    const select = (start: number, end = start) => {
      const text = body.firstChild!;
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, end);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    };

    select(0, 4);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar negrita' }));
    expect(body.textContent).toBe('*Hola*');

    select(0, 6);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar negrita' }));
    expect(body.textContent).toBe('Hola');

    select(0, 4);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar negrita' }));
    expect(body.textContent).toBe('*Hola*');

    select(2);
    fireEvent.click(screen.getByRole('button', { name: 'Insertar emoji' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insertar 😀' }));
    expect(body.textContent).toBe('*H😀ola*');

    select(4);
    fireEvent.click(screen.getByRole('button', { name: 'Insertar variable' }));
    expect(body.textContent).toBe('*H😀{{1}}ola*');
  });

  it('submits the editor as plain text with positional sample values', async () => {
    const saved = vi.fn();
    render(<TemplateForm lines={lines} initialLineId="line" onBack={vi.fn()} onSaved={saved} />);
    fireEvent.change(screen.getByLabelText('Nombre de la plantilla *'), {
      target: { value: 'saludo' },
    });
    const body = screen.getByRole('textbox', { name: 'Cuerpo' });
    body.textContent = 'Hola {{1}}, gracias por escribir.';
    fireEvent.input(body);
    fireEvent.change(screen.getByLabelText('Muestra de {{1}} *'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar plantilla' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith('line'));
    expect(templatesApi.create).toHaveBeenCalledWith(
      'line',
      expect.objectContaining({
        body: 'Hola {{1}}, gracias por escribir.',
        examples: { '1': 'Ana' },
      }),
    );
  });
  it('submits authentication settings without stale marketing content', async () => {
    const saved = vi.fn();
    render(<TemplateForm lines={lines} initialLineId="line" onBack={vi.fn()} onSaved={saved} />);
    fireEvent.change(screen.getByLabelText('Nombre de la plantilla *'), {
      target: { value: 'codigo' },
    });
    fireEvent.change(screen.getByLabelText('Categoría *'), { target: { value: 'AUTHENTICATION' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar plantilla' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(templatesApi.create).toHaveBeenCalledWith(
      'line',
      expect.objectContaining({
        category: 'AUTHENTICATION',
        body: '',
        buttons: [],
        examples: {},
        codeExpirationMinutes: 10,
      }),
    );
  });
});
