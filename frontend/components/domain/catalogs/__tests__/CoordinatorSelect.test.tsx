import { CoordinatorSelect } from '@/components/domain/catalogs/CoordinatorSelect';
import { coordinatorsApi } from '@/lib/coordinators-api';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/coordinators-api', () => ({
  coordinatorsApi: {
    list: vi.fn(),
  },
}));

const list = vi.mocked(coordinatorsApi.list);
let consoleError: ReturnType<typeof vi.spyOn>;

function duplicateKeyWarnings(): unknown[][] {
  return consoleError.mock.calls.filter((call) =>
    call.some((arg) => typeof arg === 'string' && /same key/i.test(arg)),
  );
}

describe('CoordinatorSelect', () => {
  beforeEach(() => {
    list.mockReset();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('uses a single none option when no section is selected', () => {
    render(<CoordinatorSelect onValueChange={vi.fn()} />);

    expect(screen.getByRole('combobox')).toHaveTextContent('Seleccioná primero la sección');
    expect(duplicateKeyWarnings()).toHaveLength(0);
  });

  it('lists coordinators without duplicating the none sentinel', async () => {
    list.mockResolvedValue({
      ok: true,
      data: {
        coordinators: [
          {
            id: 'coord-1',
            fullName: 'Ana Coordinadora',
            email: 'ana@ejemplo.mx',
            isActive: true,
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
            sectionId: 'section-1',
            section: { id: 'section-1', sectionCode: '0042' },
          },
        ],
      },
    });

    render(<CoordinatorSelect sectionId="section-1" onValueChange={vi.fn()} />);

    expect(await screen.findByRole('combobox')).toHaveTextContent('Sin coordinador asignado');
    expect(duplicateKeyWarnings()).toHaveLength(0);
  });
});
