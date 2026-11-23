import { StructureForm } from '@/components/admin/structures/StructureForm';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('StructureForm', () => {
  it('submits name, HEX color and optional encargado fields', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    const onOpenChange = vi.fn();
    render(<StructureForm open onOpenChange={onOpenChange} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Nombre', { selector: '#structure-name' }), {
      target: { value: 'Territorial' },
    });
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#10b981' } });
    fireEvent.change(
      screen.getByLabelText('Nombre', { selector: '#structure-manager-first-name' }),
      {
        target: { value: 'Ana' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Territorial',
        color: '#10B981',
        managerFirstName: 'Ana',
        managerLastName: null,
        managerPhone: null,
      });
    });
  });
});
