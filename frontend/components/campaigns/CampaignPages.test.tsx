import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignList, CampaignAnalytics } from './CampaignPages';
import { campaignsApi } from '@/lib/campaigns-api';
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('@/lib/campaigns-api', () => ({
  campaignsApi: { list: vi.fn(), detail: vi.fn() },
  campaignStatus: {},
}));
afterEach(() => vi.useRealTimers());
const summary = {
  id: 'one',
  name: 'Aviso',
  purpose: 'Info',
  status: 'queued',
  total: 1,
  createdAt: '2026-10-14',
};
describe('Campaign refresh', () => {
  it.each(['list', 'detail'] as const)(
    'loads %s once, remains idle, and refreshes on demand with a busy state',
    async (kind) => {
      vi.useFakeTimers();
      const data =
        kind === 'list'
          ? { rows: [summary], total: 1, pageSize: 25 }
          : {
              ...summary,
              counts: { pending: 1, sent: 0, delivered: 0, read: 0, failed: 0 },
              sentTotal: 0,
              deliveredTotal: 0,
              uncertain: 0,
              recipients: [],
              page: 1,
              pageSize: 50,
            };
      const call = vi.mocked(campaignsApi[kind]);
      call.mockResolvedValue(data as never);
      render(kind === 'list' ? <CampaignList /> : <CampaignAnalytics id="one" />);
      await act(async () => {});
      expect(call).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(call).toHaveBeenCalledTimes(1);
      let finish!: (value: never) => void;
      call.mockImplementationOnce(
        () =>
          new Promise<never>((resolve) => {
            finish = resolve;
          }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Actualizar Resultados' }));
      expect(screen.getByRole('button', { name: 'Actualizar Resultados' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Actualizar Resultados' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
      expect(call).toHaveBeenCalledTimes(2);
      await act(async () => {
        finish(data as never);
      });
      expect(screen.getByRole('button', { name: 'Actualizar Resultados' })).toBeEnabled();
    },
  );
  it('keeps results visible and offers retry after a refresh failure', async () => {
    vi.mocked(campaignsApi.list).mockResolvedValue({ rows: [summary], total: 1, pageSize: 25 });
    render(<CampaignList />);
    expect(await screen.findByText('Aviso')).toBeInTheDocument();
    vi.mocked(campaignsApi.list).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar Resultados' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
    expect(screen.getByText('Aviso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar Resultados' })).toBeEnabled();
  });
});
