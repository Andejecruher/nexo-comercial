import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignWizard } from './CampaignWizard';
import { campaignsApi, type CampaignAttachment } from '@/lib/campaigns-api';
import { citizensApi } from '@/lib/citizens-api';
const fixture = vi.hoisted(() => ({ kind: 'DOCUMENT' }));
vi.mock('@/lib/campaigns-api', async (original) => ({
  ...(await original<object>()),
  campaignsApi: { uploadMedia: vi.fn(), create: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('@/lib/citizens-api', async (original) => ({
  ...(await original<object>()),
  citizensApi: { get: vi.fn() },
}));
vi.mock('./CampaignAudiencePicker', () => ({
  CampaignAudiencePicker: ({ selected }: { selected: Record<string, unknown> }) => (
    <p>Audiencia preseleccionada: {Object.keys(selected).length}</p>
  ),
}));
vi.mock('@/lib/templates-api', async (original) => ({
  ...(await original<object>()),
  templatesApi: { lines: async () => [{ id: 'line', name: 'Línea' }] },
}));
vi.mock('./CampaignTemplatePicker', () => ({
  CampaignTemplatePicker: ({ onChange }: { onChange: (value: unknown) => void }) => (
    <button
      onClick={() =>
        onChange({
          id: '123',
          name: 'aviso',
          status: 'APPROVED',
          components: [
            { type: 'HEADER', format: fixture.kind },
            { type: 'BODY', text: 'Mensaje de campaña' },
          ],
        })
      }
    >
      Elegir plantilla
    </button>
  ),
}));
vi.mock('./CsvAudienceMapping', () => ({
  selectClass: '',
  VariableMapping: () => <p>Variables</p>,
  CsvAudience: ({
    onChange,
    onPhoneColumn,
  }: {
    onChange: (headers: string[], rows: unknown[]) => void;
    onPhoneColumn: (field: string) => void;
  }) => (
    <button
      onClick={() => {
        onChange(['phone'], [{ phone: '525512345678' }]);
        onPhoneColumn('phone');
      }}
    >
      Cargar audiencia
    </button>
  ),
}));
beforeEach(() => {
  fixture.kind = 'DOCUMENT';
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn().mockReturnValue('blob:campaign-preview');
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});
async function openUpload() {
  const result = render(<CampaignWizard />);
  await screen.findByText('Línea');
  fireEvent.change(screen.getByLabelText('Nombre de la campaña'), { target: { value: 'Aviso' } });
  fireEvent.change(screen.getByLabelText('Propósito'), { target: { value: 'Invitación' } });
  fireEvent.change(screen.getByLabelText('Línea de WhatsApp'), { target: { value: 'line' } });
  fireEvent.click(screen.getByRole('button', { name: 'Elegir plantilla' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cargar audiencia' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  return result;
}
describe('Campaign wizard navigation', () => {
  it('loads selected citizens from the URL into the audience step', async () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    window.history.replaceState({}, '', `/?citizenId=${id}`);
    vi.mocked(citizensApi.get).mockResolvedValueOnce({
      ok: true,
      data: { citizen: { id, name: 'Ana', phone: '525512345678', consentGiven: true } as never },
    });
    render(<CampaignWizard />);
    await waitFor(() => expect(citizensApi.get).toHaveBeenCalledWith(id));
    await screen.findByText('Línea');
    fireEvent.change(screen.getByLabelText('Nombre de la campaña'), { target: { value: 'Aviso' } });
    fireEvent.change(screen.getByLabelText('Propósito'), { target: { value: 'Invitación' } });
    fireEvent.click(screen.getByRole('button', { name: 'Elegir plantilla' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Audiencia preseleccionada: 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Origen de la audiencia')).toHaveValue('citizen');
  });
  it('returns to prior steps without losing form state and requires media before summary', async () => {
    render(<CampaignWizard />);
    await screen.findByText('Línea');
    fireEvent.change(screen.getByLabelText('Nombre de la campaña'), { target: { value: 'Aviso' } });
    fireEvent.change(screen.getByLabelText('Propósito'), { target: { value: 'Invitación' } });
    fireEvent.click(screen.getByRole('button', { name: 'Elegir plantilla' }));
    expect(screen.getByRole('button', { name: '3. Variables' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cargar audiencia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByLabelText('Seleccionar adjunto')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Carga el adjunto');
    fireEvent.click(screen.getByRole('button', { name: '1. Configuración' }));
    expect(screen.getByLabelText('Nombre de la campaña')).toHaveValue('Aviso');
    expect(screen.getByLabelText('Propósito')).toHaveValue('Invitación');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it.each([
    ['IMAGE', 'image/png', 'aviso.png'],
    ['VIDEO', 'video/mp4', 'aviso.mp4'],
    ['DOCUMENT', 'application/pdf', 'aviso.pdf'],
  ] as const)(
    'previews %s immediately and preserves it through summary and back navigation',
    async (kind, type, filename) => {
      fixture.kind = kind;
      let finish!: (value: CampaignAttachment) => void;
      vi.mocked(campaignsApi.uploadMedia).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const { unmount } = await openUpload();
      const file = new File(['media'], filename, { type });
      const dropzone = screen.getByRole('region', { name: 'Adjunto de la plantilla' });
      fireEvent.drop(within(dropzone).getByRole('button').parentElement!, {
        dataTransfer: { files: [file] },
      });
      expect(screen.getByText(filename)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
      const checkMedia = (container: HTMLElement) => {
        if (kind === 'IMAGE')
          expect(within(container).getByRole('img', { name: filename })).toHaveAttribute(
            'src',
            'blob:campaign-preview',
          );
        else if (kind === 'VIDEO') {
          expect(within(container).getByLabelText(filename)).toHaveAttribute(
            'src',
            'blob:campaign-preview',
          );
          expect(within(container).getByLabelText(filename)).toHaveAttribute('controls');
        } else expect(within(container).getByText(filename)).toBeInTheDocument();
      };
      checkMedia(dropzone);
      expect(campaignsApi.uploadMedia).toHaveBeenCalledWith(
        file,
        { name: 'Aviso', lineId: 'line', templateId: '123' },
        expect.any(AbortSignal),
      );
      await act(async () =>
        finish({
          id: 'media',
          filename,
          mediaType: kind,
          url: 'https://example.com/download',
          viewUrl: 'https://example.com/view',
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      const mobile = screen.getByRole('region', { name: 'Vista previa móvil' });
      checkMedia(mobile);
      expect(within(mobile).getByText('Mensaje de campaña')).toBeInTheDocument();
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
      checkMedia(screen.getByRole('region', { name: 'Adjunto de la plantilla' }));
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      unmount();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:campaign-preview');
    },
  );
  it('releases replaced previews, rejects invalid files and keeps failed uploads out of summary', async () => {
    fixture.kind = 'IMAGE';
    vi.mocked(campaignsApi.uploadMedia).mockResolvedValueOnce({
      id: 'media',
      filename: 'uno.png',
      mediaType: 'IMAGE',
      url: 'https://example.com/download',
      viewUrl: 'https://example.com/view',
    });
    await openUpload();
    const input = screen.getByLabelText('Seleccionar adjunto');
    fireEvent.change(input, {
      target: { files: [new File(['media'], 'uno.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled());
    fireEvent.change(input, {
      target: { files: [new File(['text'], 'invalido.txt', { type: 'text/plain' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('archivo compatible');
    expect(campaignsApi.uploadMedia).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:replacement');
    vi.mocked(campaignsApi.uploadMedia).mockRejectedValueOnce(new Error('No se pudo subir'));
    fireEvent.change(input, {
      target: { files: [new File(['media'], 'dos.png', { type: 'image/png' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo subir');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:campaign-preview');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:replacement');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.queryByRole('region', { name: 'Vista previa móvil' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1. Configuración' }));
    fireEvent.click(screen.getByRole('button', { name: 'Elegir plantilla' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:replacement');
  });
});
