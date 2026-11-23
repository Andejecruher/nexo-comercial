import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();

vi.mock('@/lib/structures-api', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    structuresApi: {
      list: (...args: unknown[]) => mockList(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      remove: (...args: unknown[]) => mockRemove(...args),
    },
  };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { useStructures } from '@/hooks/useStructures';

const territorial = {
  id: 'struct-1',
  slug: 'territorial',
  name: 'Territorial',
  color: '#10B981',
  isActive: true,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

describe('useStructures', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes update and remove mutations after the initial list', async () => {
    mockList.mockResolvedValue({ ok: true, data: { structures: [territorial] } });
    mockUpdate.mockResolvedValue({
      ok: true,
      data: { structure: { ...territorial, name: 'Zona norte' } },
    });
    mockRemove.mockResolvedValue({
      ok: true,
      data: { structure: { ...territorial, isActive: false } },
    });

    const { result } = renderHook(() => useStructures({ includeInactive: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.structures).toEqual([territorial]);

    await act(async () => {
      const updated = await result.current.updateStructure('struct-1', { name: 'Zona norte' });
      expect(updated.success).toBe(true);
    });
    expect(mockUpdate).toHaveBeenCalledWith('struct-1', { name: 'Zona norte' });

    await act(async () => {
      const removed = await result.current.removeStructure('struct-1');
      expect(removed.success).toBe(true);
    });
    expect(mockRemove).toHaveBeenCalledWith('struct-1');
  });
});
