/**
 * TagForm — Form modal para crear/editar etiquetas
 *
 * Validación inline, color picker simple.
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
import { Textarea } from '@/components/ui/textarea';
import type { Tag } from '@/lib/shared/catalog-api';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface TagFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag?: Tag; // undefined = create, defined = edit
  onSubmit: (data: {
    name: string;
    description?: string;
    color?: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

// Colores sugeridos
const SUGGESTED_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#F59E0B', // amber
  '#84CC16', // lime
  '#10B981', // emerald
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#64748B', // slate
];

export function TagForm({ open, onOpenChange, tag, onSubmit }: TagFormProps) {
  const isEdit = !!tag;

  // ─── Form State ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: '',
    description: '',
    color: '',
  });

  const [submitting, setSubmitting] = useState(false);

  // ─── Reset form cuando cambia el tag ───────────────────────────────────────
  useEffect(() => {
    if (tag) {
      setForm({
        name: tag.name,
        description: tag.description ?? '',
        color: tag.color ?? '',
      });
    } else {
      setForm({ name: '', description: '', color: '' });
    }
  }, [tag, open]);

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

    if (form.name.length > 100) {
      toast.error('El nombre no puede superar 100 caracteres');
      return false;
    }

    if (form.description && form.description.length > 4000) {
      toast.error('La descripción no puede superar 4000 caracteres');
      return false;
    }

    if (form.color && form.color.length > 20) {
      toast.error('El color no puede superar 20 caracteres');
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
      description: form.description.trim() || undefined,
      color: form.color.trim() || undefined,
    };

    const result = await onSubmit(payload);

    setSubmitting(false);

    if (result.success) {
      onOpenChange(false);
      setForm({ name: '', description: '', color: '' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar etiqueta' : 'Nueva etiqueta'}</DialogTitle>
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
              placeholder="Ej: Prioridad Alta, Seguimiento"
              maxLength={100}
              disabled={submitting}
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="color"
                type="text"
                value={form.color}
                onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                placeholder="#3B82F6"
                maxLength={20}
                disabled={submitting}
                className="flex-1"
              />
              {form.color && (
                <div
                  className="w-10 h-10 rounded border shrink-0"
                  style={{ backgroundColor: form.color }}
                />
              )}
            </div>
            {/* Suggested Colors */}
            <div className="flex flex-wrap gap-2 mt-2">
              {SUGGESTED_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, color }))}
                  className="w-7 h-7 rounded border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  disabled={submitting}
                  aria-label={`Color ${color}`}
                />
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Descripción de la etiqueta..."
              rows={3}
              maxLength={4000}
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
