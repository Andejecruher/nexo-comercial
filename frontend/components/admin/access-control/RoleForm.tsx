'use client';

import { ProtectedEntityBadge } from '@/components/admin/access-control/ProtectedEntityBadge';
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
import { isSystemRole, type CreateRolePayload, type RoleDto } from '@/lib/roles-permissions-api';
import { useEffect, useMemo, useState } from 'react';

const SLUG_REGEX = /^[a-z0-9_-]+$/;

interface RoleFormProps {
  open: boolean;
  role?: RoleDto;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateRolePayload) => Promise<{ success: boolean; error?: string }>;
}

interface FormErrors {
  name?: string;
  slug?: string;
  description?: string;
  form?: string;
}

export function RoleForm({ open, role, onOpenChange, onSubmit }: RoleFormProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const protectedRole = useMemo(() => (role ? isSystemRole(role) : false), [role]);

  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setSlug(role?.slug ?? '');
    setDescription(role?.description ?? '');
    setErrors({});
    setSubmitting(false);
  }, [open, role]);

  const validate = () => {
    const next: FormErrors = {};
    const cleanName = name.trim();
    const cleanSlug = slug.trim();
    const cleanDescription = description.trim();
    if (cleanName.length < 2) next.name = 'El nombre debe tener al menos 2 caracteres.';
    if (cleanName.length > 50) next.name = 'El nombre no puede superar 50 caracteres.';
    if (!cleanSlug) next.slug = 'La clave es obligatoria.';
    if (cleanSlug.length > 80) next.slug = 'La clave no puede superar 80 caracteres.';
    if (cleanSlug && !SLUG_REGEX.test(cleanSlug))
      next.slug = 'Usá solo minúsculas, números, guion o guion bajo.';
    if (cleanDescription.length > 255)
      next.description = 'La descripción no puede superar 255 caracteres.';
    if (protectedRole && role && (cleanName !== role.name || cleanSlug !== role.slug)) {
      next.form = 'Este rol es interno: no se puede modificar su nombre ni clave.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (submitting || !validate()) return;
    setSubmitting(true);
    const result = await onSubmit({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
    });
    setSubmitting(false);
    if (result.success) onOpenChange(false);
    if (!result.success && result.error) setErrors((prev) => ({ ...prev, form: result.error }));
  };

  return (
    <Dialog open={open} onOpenChange={submitting ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {role ? 'Editar rol' : 'Nuevo rol'} {protectedRole && <ProtectedEntityBadge />}
          </DialogTitle>
          <DialogDescription>
            Define el nombre visible, clave interna y propósito del rol administrativo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {errors.form && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.form}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="role-name">Nombre</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting || protectedRole}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-slug">Clave interna</Label>
            <Input
              id="role-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={submitting || protectedRole}
              aria-invalid={!!errors.slug}
              placeholder="coordinador_territorial"
            />
            {errors.slug ? (
              <p className="text-xs text-destructive">{errors.slug}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Debe coincidir con el formato backend: minúsculas, números, guiones o guion bajo.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-description">Descripción</Label>
            <Textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              aria-invalid={!!errors.description}
              rows={3}
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando...' : role ? 'Guardar cambios' : 'Crear rol'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
