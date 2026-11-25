'use client';

import { ExportButton } from '@/components/ciudadanos/ExportButton';
import { PaginationControls } from '@/components/shared/catalogs/PaginationControls';
import { CitizenFilters } from '@/components/ciudadanos/CitizenFilters';
import { CitizenTable } from '@/components/shared/citizens/CitizenTable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCitizens } from '@/hooks/ciudadanos/useCitizens';
import { usePermissions } from '@/hooks/shared/usePermissions';
import { citizensApi, type Citizen, type UpdateCitizenPayload } from '@/lib/shared/citizens-api';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

export function CitizensView() {
  const citizensState = useCitizens();
  const { can } = usePermissions();
  const [editing, setEditing] = useState<Citizen | null>(null);
  const [deleting, setDeleting] = useState<Citizen | null>(null);
  const [form, setForm] = useState({
    name: '',
    lastName: '',
    phone: '',
    email: '',
    consentGiven: false,
  });
  const [busy, setBusy] = useState(false);

  const openEdit = (citizen: Citizen) => {
    setForm({
      name: citizen.name ?? '',
      lastName: citizen.lastName ?? '',
      phone: citizen.phone ?? '',
      email: citizen.email ?? '',
      consentGiven: citizen.consentGiven,
    });
    setEditing(citizen);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || busy) return;
    const payload: UpdateCitizenPayload = {};
    for (const field of ['name', 'lastName', 'email'] as const) {
      const value = form[field].trim();
      if (value !== (editing[field] ?? '')) payload[field] = value || null;
    }
    if (form.phone.trim() !== (editing.phone ?? '')) payload.phone = form.phone.trim();
    if (form.consentGiven !== editing.consentGiven) payload.consentGiven = form.consentGiven;
    if (Object.keys(payload).length === 0) {
      setEditing(null);
      return;
    }
    setBusy(true);
    try {
      const result = await citizensApi.update(editing.id, payload);
      if (!result.ok) {
        toast.error('No se pudo actualizar el ciudadano', { description: result.message });
        return;
      }
      citizensState.updateCitizenLocally(result.data.citizen);
      setEditing(null);
      toast.success('Ciudadano actualizado');
    } catch {
      toast.error('No se pudo actualizar el ciudadano');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      const result = await citizensApi.remove(deleting.id);
      if (!result.ok) {
        toast.error('No se pudo eliminar el ciudadano', { description: result.message });
        return;
      }
      citizensState.removeCitizenLocally(deleting.id);
      setDeleting(null);
      toast.success('Ciudadano eliminado');
    } catch {
      toast.error('No se pudo eliminar el ciudadano');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full min-w-0 overflow-x-hidden overflow-y-auto">
      <div className="min-w-0 space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-foreground">CRM de ciudadanos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {citizensState.totalCount} ciudadanos en la página actual
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              variant="outline"
              className="max-sm:flex-1"
              onClick={citizensState.clearSelection}
            >
              Limpiar selección ({citizensState.selectedCitizenIds.length})
            </Button>
            <Button variant="outline" className="max-sm:flex-1" onClick={citizensState.refresh}>
              Actualizar
            </Button>
            <ExportButton
              module="citizens"
              filters={{
                search: citizensState.filters.search || undefined,
                phone: citizensState.filters.phone || undefined,
                leadStatus: citizensState.filters.leadStatus,
                neighborhoodId: citizensState.filters.neighborhood,
              }}
            />
          </div>
        </div>

        <CitizenFilters
          search={citizensState.filters.search}
          phone={citizensState.filters.phone}
          leadStatus={citizensState.filters.leadStatus}
          neighborhood={citizensState.filters.neighborhood}
          selectedCitizenIds={citizensState.selectedCitizenIds}
          onSearchChange={citizensState.setSearch}
          onLeadStatusChange={citizensState.setLeadStatus}
          onNeighborhoodChange={citizensState.setNeighborhood}
          onClear={citizensState.clearFilters}
        />

        <CitizenTable
          citizens={citizensState.citizens}
          loading={citizensState.loading}
          selectedCitizenIds={citizensState.selectedCitizenIds}
          onToggleCitizen={citizensState.toggleCitizenSelection}
          onToggleSelectAll={citizensState.toggleSelectAllCurrentPage}
          onEdit={can('ciudadanos.update') ? openEdit : undefined}
          onDelete={can('ciudadanos.delete') ? setDeleting : undefined}
        />

        <PaginationControls
          currentPage={citizensState.currentPage}
          hasNextPage={citizensState.hasNextPage}
          hasPreviousPage={citizensState.hasPreviousPage}
          totalCount={citizensState.totalCount}
          loading={citizensState.loading}
          onNext={citizensState.nextPage}
          onPrevious={citizensState.previousPage}
          onFirst={citizensState.firstPage}
        />

        {/* <CitizenWhatsAppPanel selectedCitizenIds={citizensState.selectedCitizenIds} /> */}
      </div>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar ciudadano</DialogTitle>
            <DialogDescription>Actualiza sus datos de contacto y consentimiento.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                Nombre
                <Input
                  maxLength={255}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-sm">
                Apellido
                <Input
                  maxLength={255}
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              Teléfono
              <Input
                required
                minLength={6}
                maxLength={30}
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label className="block space-y-1 text-sm">
              Correo electrónico
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.consentGiven}
                onChange={(e) => setForm({ ...form, consentGiven: e.target.checked })}
              />
              Aceptó recibir mensajes de WhatsApp
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar ciudadano</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar al ciudadano{' '}
              {[deleting?.name, deleting?.lastName].filter(Boolean).join(' ') || deleting?.phone}?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {busy ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
