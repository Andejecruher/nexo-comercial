'use client';

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PermissionDto, PermissionPayload } from '@/lib/shared/roles-permissions-api';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

interface PermissionFormProps {
  open: boolean;
  permission?: PermissionDto;
  /** Prefills a new permission from an existing one; the key stays empty on purpose. */
  cloneFrom?: PermissionDto;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: PermissionPayload) => Promise<{ success: boolean; error?: string }>;
}

const EMPTY = { name: '', slug: '', module: '', description: '' };

export function PermissionForm({
  open,
  permission,
  cloneFrom,
  canEdit,
  onOpenChange,
  onSubmit,
}: PermissionFormProps) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (permission) {
      setForm({
        name: permission.name,
        slug: permission.slug,
        module: permission.module,
        description: permission.description ?? '',
      });
    } else if (cloneFrom) {
      setForm({
        name: `${cloneFrom.name} (copia)`,
        slug: '',
        module: cloneFrom.module,
        description: cloneFrom.description ?? '',
      });
    } else {
      setForm(EMPTY);
    }
    setError(undefined);
  }, [permission, cloneFrom, open]);
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.module.trim() || !form.slug.trim())
      return setError('Nombre, módulo y clave son obligatorios.');
    setSaving(true);
    setError(undefined);
    const result = await onSubmit({ ...form, description: form.description.trim() || null });
    setSaving(false);
    if (!result.success) return setError(result.error ?? 'No se pudo guardar el permiso.');
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px]">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {permission ? 'Editar permiso' : cloneFrom ? 'Clonar permiso' : 'Crear permiso'}
            </DialogTitle>
            <DialogDescription>
              {cloneFrom
                ? `Se copian los datos de ${cloneFrom.name}. Asigná una clave técnica nueva y única.`
                : 'El nombre es visible para administradores; la clave técnica solo habilita funciones que la referencien explícitamente en el código.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-5">
            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="permission-name">Nombre</Label>
              <Input
                id="permission-name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                maxLength={100}
                disabled={!canEdit || saving}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="permission-key">Clave técnica</Label>
              <Input
                id="permission-key"
                value={form.slug}
                onChange={(e) => set('slug', e.target.value)}
                placeholder="miembros.crear"
                disabled={!canEdit || saving || permission?.isSystem}
                required
                aria-describedby="permission-key-help"
              />
              <p id="permission-key-help" className="text-xs text-muted-foreground">
                Identificador técnico utilizado por el sistema. Ejemplo: miembros.crear.
                {permission?.isSystem && ' Esta clave está protegida porque pertenece al sistema.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="permission-module">Módulo</Label>
              <Input
                id="permission-module"
                value={form.module}
                onChange={(e) => set('module', e.target.value)}
                placeholder="miembros"
                maxLength={80}
                disabled={!canEdit || saving}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="permission-description">Descripción</Label>
              <Textarea
                id="permission-description"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                maxLength={255}
                rows={3}
                disabled={!canEdit || saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!canEdit || saving}>
              {saving
                ? 'Guardando…'
                : permission
                  ? 'Guardar cambios'
                  : cloneFrom
                    ? 'Clonar permiso'
                    : 'Crear permiso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
