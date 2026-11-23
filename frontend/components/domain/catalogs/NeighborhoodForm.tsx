/**
 * NeighborhoodForm — Form modal para crear/editar barrios
 *
 * Validación inline, optimistic updates desde el hook.
 */

'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Neighborhood } from '@/lib/catalog-api';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface NeighborhoodFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  neighborhood?: Neighborhood; // undefined = create, defined = edit
  onSubmit: (data: {
    name: string;
    zone?: string;
    postalCode?: string;
    municipality?: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export function NeighborhoodForm({
  open,
  onOpenChange,
  neighborhood,
  onSubmit,
}: NeighborhoodFormProps) {
  const isEdit = !!neighborhood;

  // ─── Form State ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: '',
    zone: '',
    postalCode: '',
    municipality: '',
  });

  const [submitting, setSubmitting] = useState(false);

  // ─── Reset form cuando cambia el neighborhood ──────────────────────────────
  useEffect(() => {
    if (neighborhood) {
      setForm({
        name: neighborhood.name,
        zone: neighborhood.zone ?? '',
        postalCode: neighborhood.postalCode ?? '',
        municipality: neighborhood.municipality ?? '',
      });
    } else {
      setForm({ name: '', zone: '', postalCode: '', municipality: '' });
    }
  }, [neighborhood, open]);

  // ─── Validación ────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    if (!form.name.trim()) {
      toast.error('El nombre es requerido');
      return false;
    }

    if (form.name.trim().length < 2) {
      toast.error('El nombre debe tener al menos 2 caracteres');
      return false;
    }

    if (form.name.length > 255) {
      toast.error('El nombre no puede superar 255 caracteres');
      return false;
    }

    if (form.postalCode && form.postalCode.length > 10) {
      toast.error('El código postal no puede superar 10 caracteres');
      return false;
    }

    if (form.municipality && form.municipality.length > 100) {
      toast.error('El municipio no puede superar 100 caracteres');
      return false;
    }

    if (form.zone && form.zone.length > 100) {
      toast.error('La zona no puede superar 100 caracteres');
      return false;
    }

    return true;
  };

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);

    const payload = {
      name: form.name.trim(),
      zone: form.zone.trim() || undefined,
      postalCode: form.postalCode.trim() || undefined,
      municipality: form.municipality.trim() || undefined,
    };

    const result = await onSubmit(payload);

    setSubmitting(false);

    if (result.success) {
      onOpenChange(false);
      setForm({ name: '', zone: '', postalCode: '', municipality: '' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar barrio' : 'Nuevo barrio'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Ej: Centro, Barrio Nuevo"
              maxLength={255}
              disabled={submitting}
            />
          </div>

          {/* Zone */}
          <div className="space-y-2">
            <Label htmlFor="zone">Zona</Label>
            <Input
              id="zone"
              value={form.zone}
              onChange={(e) => setForm((prev) => ({ ...prev, zone: e.target.value }))}
              placeholder="Ej: Norte, Sur, Centro"
              maxLength={100}
              disabled={submitting}
            />
          </div>

          {/* Postal Code */}
          <div className="space-y-2">
            <Label htmlFor="postalCode">Código Postal</Label>
            <Input
              id="postalCode"
              value={form.postalCode}
              onChange={(e) => setForm((prev) => ({ ...prev, postalCode: e.target.value }))}
              placeholder="Ej: 29140"
              maxLength={10}
              disabled={submitting}
            />
          </div>

          {/* Municipality */}
          <div className="space-y-2">
            <Label htmlFor="municipality">Municipio</Label>
            <Input
              id="municipality"
              value={form.municipality}
              onChange={(e) => setForm((prev) => ({ ...prev, municipality: e.target.value }))}
              placeholder="Ej: Ocozocoautla de Espinosa"
              maxLength={100}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando...' : isEdit ? 'Actualizar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
