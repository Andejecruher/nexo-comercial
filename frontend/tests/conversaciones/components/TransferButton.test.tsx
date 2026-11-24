import {
  TransferButton,
  type TransferDestinationType,
} from '@/components/conversaciones/TransferButton';
import type { PanelUserDto } from '@/lib/shared/admin-users-api';
import type { Department } from '@/lib/shared/catalog-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function departments(): Department[] {
  const base = {
    keywords: [],
    schedule: [],
    scheduleExceptions: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
  return [
    { id: 'dept-1', name: 'Seguridad Pública', slug: 'seguridad', isActive: true, ...base },
    { id: 'dept-2', name: 'Atención Ciudadana', slug: 'atencion', isActive: true, ...base },
    { id: 'dept-3', name: 'Obras Públicas', slug: 'obras', isActive: false, ...base },
  ];
}

function users(): PanelUserDto[] {
  return [
    {
      id: 'user-1',
      fullName: 'Ana García',
      email: 'ana@test.com',
      isActive: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      roles: [],
    },
    {
      id: 'user-2',
      fullName: null,
      email: 'luis@test.com',
      isActive: false,
      createdAt: '2026-09-01T00:00:00.000Z',
      roles: [],
    },
  ];
}

describe('TransferButton — opciones principales', () => {
  it('muestra las tres opciones de destino al abrir el menú', () => {
    render(
      <TransferButton departments={departments()} panelUsers={users()} onTransfer={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Transferir/ }));
    expect(screen.getByText('Transferir a Departamento')).toBeDefined();
    expect(screen.getByText('Transferir a Agente')).toBeDefined();
    expect(screen.getByText('Devolver al Agente IA')).toBeDefined();
  });

  it('oculta solo los departamentos inactivos en el select', async () => {
    render(
      <TransferButton departments={departments()} panelUsers={users()} onTransfer={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Transferir/ }));
    fireEvent.click(screen.getByText('Transferir a Departamento'));

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    expect(await screen.findByText('Seguridad Pública')).toBeDefined();
    expect(screen.getByText('Atención Ciudadana')).toBeDefined();
    expect(screen.queryByText('Obras Públicas')).toBeNull();
  });
});

describe('TransferButton — confirmación y cancelación', () => {
  it('confirma una transferencia a departamento con su slug', async () => {
    const onTransfer = vi.fn<(type: TransferDestinationType, targetId: string) => Promise<boolean>>(
      async () => true,
    );
    render(
      <TransferButton departments={departments()} panelUsers={users()} onTransfer={onTransfer} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Transferir/ }));
    fireEvent.click(screen.getByText('Transferir a Departamento'));

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText('Seguridad Pública'));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Transferencia' }));

    await waitFor(() => expect(onTransfer).toHaveBeenCalledWith('department', 'seguridad'));
  });

  it('confirma la devolución al agente IA sin id', async () => {
    const onTransfer = vi.fn<(type: TransferDestinationType, targetId: string) => Promise<boolean>>(
      async () => true,
    );
    render(
      <TransferButton departments={departments()} panelUsers={users()} onTransfer={onTransfer} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Transferir/ }));
    fireEvent.click(screen.getByText('Devolver al Agente IA'));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Transferencia' }));

    await waitFor(() => expect(onTransfer).toHaveBeenCalledWith('ai', ''));
  });

  it('no habilita confirmar sin un agente seleccionado', () => {
    render(
      <TransferButton departments={departments()} panelUsers={users()} onTransfer={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Transferir/ }));
    fireEvent.click(screen.getByText('Transferir a Agente'));

    const confirm = screen.getByRole('button', { name: 'Confirmar Transferencia' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it('cancelar cierra el popover y restaura el estado', () => {
    render(
      <TransferButton departments={departments()} panelUsers={users()} onTransfer={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Transferir/ }));
    fireEvent.click(screen.getByText('Transferir a Agente'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText('Transferir a Departamento')).toBeNull();
    expect(screen.getByRole('button', { name: /Transferir/ })).toBeDefined();
  });
});
