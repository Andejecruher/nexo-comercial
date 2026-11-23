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
import { PhoneInputWithCountry } from '@/components/ui/phone-input-with-country';
import {
  DEFAULT_STRUCTURE_COLOR,
  emptyToNull,
  isHexColor,
  normalizeHexColor,
} from '@/components/admin/structures/structure-utils';
import type { OrganizationalStructureDto } from '@/lib/structures-api';
import { isValidPhoneNumber, toDigitsE164 } from '@/lib/promovido-schema';
import { useEffect, useState, type FormEvent } from 'react';

export interface StructureFormPayload {
  name: string;
  color: string;
  managerFirstName: string | null;
  managerLastName: string | null;
  managerPhone: string | null;
}

interface StructureFormProps {
  open: boolean;
  structure?: OrganizationalStructureDto;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: StructureFormPayload) => Promise<{ success: boolean }>;
}

const fieldClassName =
  'h-11 w-full rounded-lg bg-background shadow-xs focus-visible:border-primary focus-visible:ring-primary/20';

export function StructureForm({ open, structure, onOpenChange, onSubmit }: StructureFormProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_STRUCTURE_COLOR);
  const [managerFirstName, setManagerFirstName] = useState('');
  const [managerLastName, setManagerLastName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const isEditing = !!structure;
  const phoneInvalid = managerPhone.trim().length > 0 && !isValidPhoneNumber(managerPhone);

  useEffect(() => {
    if (!open) return;
    setName(structure?.name ?? '');
    setColor(structure?.color ?? DEFAULT_STRUCTURE_COLOR);
    setManagerFirstName(structure?.managerFirstName ?? '');
    setManagerLastName(structure?.managerLastName ?? '');
    setManagerPhone(structure?.managerPhone ?? '');
    setError(undefined);
  }, [open, structure]);

  function handleColorTextChange(value: string) {
    const next = value.startsWith('#') ? value : `#${value}`;
    setColor(next.toUpperCase());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    if (!isHexColor(color)) {
      setError('El color debe ser un HEX de 6 dígitos, por ejemplo #10B981.');
      return;
    }
    if (phoneInvalid) {
      setError('Ingresá un teléfono válido para el encargado.');
      return;
    }
    setSubmitting(true);
    const result = await onSubmit({
      name: cleanName,
      color: normalizeHexColor(color),
      managerFirstName: emptyToNull(managerFirstName),
      managerLastName: emptyToNull(managerLastName),
      managerPhone: toDigitsE164(managerPhone) || null,
    });
    setSubmitting(false);
    if (result.success) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar estructura' : 'Crear estructura'}</DialogTitle>
          <DialogDescription>
            Las estructuras agrupan coordinadores en el mismo flujo operativo de campaña. El
            identificador (slug) se genera automáticamente al crear.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="structure-name">Nombre</Label>
            <Input
              id="structure-name"
              className={fieldClassName}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={120}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="structure-color">Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="structure-color-picker"
                type="color"
                value={(isHexColor(color) ? color : DEFAULT_STRUCTURE_COLOR).toLowerCase()}
                onChange={(event) => setColor(normalizeHexColor(event.target.value))}
                className="h-11 w-14 cursor-pointer rounded-lg border border-input bg-background p-1"
                aria-label="Selector de color"
              />
              <Input
                id="structure-color"
                className={`${fieldClassName} font-mono uppercase`}
                value={color}
                onChange={(event) => handleColorTextChange(event.target.value)}
                required
                maxLength={7}
                placeholder="#64748B"
                aria-describedby="structure-color-hint"
              />
            </div>
            <p id="structure-color-hint" className="text-xs text-muted-foreground">
              Formato HEX de 6 dígitos, por ejemplo #10B981.
            </p>
          </div>
          <fieldset className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <legend className="px-1 text-sm font-medium">Encargado (opcional)</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="structure-manager-first-name">Nombre</Label>
                <Input
                  id="structure-manager-first-name"
                  className={fieldClassName}
                  value={managerFirstName}
                  onChange={(event) => setManagerFirstName(event.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="structure-manager-last-name">Apellidos</Label>
                <Input
                  id="structure-manager-last-name"
                  className={fieldClassName}
                  value={managerLastName}
                  onChange={(event) => setManagerLastName(event.target.value)}
                  maxLength={120}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="structure-manager-phone">Teléfono</Label>
              <PhoneInputWithCountry
                id="structure-manager-phone"
                value={managerPhone}
                onChange={setManagerPhone}
                className={fieldClassName}
                placeholder="Número de contacto"
                invalid={phoneInvalid}
              />
            </div>
          </fieldset>
          {isEditing && structure.slug && (
            <p className="text-xs text-muted-foreground">
              Identificador: <span className="font-mono">{structure.slug}</span>
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
