'use client';

import { StructureColorSwatch } from '@/components/admin/structures/StructureColorSwatch';
import {
  DEFAULT_STRUCTURE_COLOR,
  isHexColor,
  normalizeHexColor,
} from '@/components/admin/structures/structure-utils';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import type { CoordinatorDto } from '@/lib/coordinators-api';
import type { ElectoralSection } from '@/lib/ine-ocr-api';
import { isValidPhoneNumber, toDigitsE164, toE164Phone } from '@/lib/promovido-schema';
import type { OrganizationalStructureDto } from '@/lib/structures-api';
import { Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

interface CoordinatorFormProps {
  open: boolean;
  coordinator?: CoordinatorDto;
  sections: ElectoralSection[];
  sectionsLoading: boolean;
  structures: OrganizationalStructureDto[];
  structuresLoading: boolean;
  canCreateStructure: boolean;
  onCreateStructure: (payload: { name: string; color: string }) => Promise<{
    success: boolean;
    structure?: OrganizationalStructureDto;
  }>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    sectionId: string;
    fullName: string;
    phone?: string | null;
    email: string;
    structureId?: string | null;
  }) => Promise<{ success: boolean }>;
}

const NONE_STRUCTURE = '__none__';

const fieldClassName =
  'h-11 w-full rounded-lg bg-background shadow-xs focus-visible:border-primary focus-visible:ring-primary/20';

export function CoordinatorForm({
  open,
  coordinator,
  sections,
  sectionsLoading,
  structures,
  structuresLoading,
  canCreateStructure,
  onCreateStructure,
  onOpenChange,
  onSubmit,
}: CoordinatorFormProps) {
  const [sectionId, setSectionId] = useState('');
  const [structureId, setStructureId] = useState(NONE_STRUCTURE);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [newStructureName, setNewStructureName] = useState('');
  const [newStructureColor, setNewStructureColor] = useState(DEFAULT_STRUCTURE_COLOR);
  const [creatingStructure, setCreatingStructure] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const isEditing = !!coordinator;

  useEffect(() => {
    if (!open) return;
    setSectionId(coordinator?.sectionId ?? '');
    setStructureId(coordinator?.structureId ?? NONE_STRUCTURE);
    setFullName(coordinator?.fullName ?? '');
    setPhone(toE164Phone(coordinator?.phone ?? ''));
    setEmail(coordinator?.email ?? '');
    setNewStructureName('');
    setNewStructureColor(DEFAULT_STRUCTURE_COLOR);
    setCreatingStructure(false);
    setError(undefined);
  }, [open, coordinator]);

  const title = isEditing ? 'Editar coordinador' : 'Crear coordinador';

  const phoneInvalid = phone.trim().length > 0 && !isValidPhoneNumber(phone);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!sectionId) return setError('Seleccioná la sección del coordinador.');
    if (cleanName.length < 2)
      return setError('El nombre completo debe tener al menos 2 caracteres.');
    if (phoneInvalid) return setError('Ingresá un teléfono válido.');
    if (!isEditing && !/^\S+@\S+\.\S+$/.test(cleanEmail))
      return setError('Ingresá un correo electrónico válido.');
    setSubmitting(true);
    const result = await onSubmit({
      sectionId,
      fullName: cleanName,
      phone: toDigitsE164(phone) || null,
      email: cleanEmail,
      structureId: structureId === NONE_STRUCTURE ? null : structureId,
    });
    setSubmitting(false);
    if (result.success) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Al crear el coordinador se crea su usuario con rol COORDINADOR y se envía una invitación
            por correo para configurar el acceso a Voz Ciudadana.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="coordinator-section">Sección electoral</Label>
            {sectionsLoading ? (
              <div className="flex h-11 items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" />
                Cargando secciones...
              </div>
            ) : (
              <Select
                value={sectionId}
                onValueChange={setSectionId}
                disabled={isEditing && !!coordinator?.sectionId}
              >
                <SelectTrigger id="coordinator-section" className={fieldClassName}>
                  <SelectValue placeholder="Seleccioná una sección" />
                </SelectTrigger>
                <SelectContent>
                  {sections
                    .filter((section) => section.isActive || section.id === sectionId)
                    .map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.state.name} · Distrito {section.district.code} · Sección{' '}
                        {section.sectionCode}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
            {isEditing && (
              <p className="text-xs text-muted-foreground">
                La sección define el cargo del coordinador y no es editable.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="coordinator-structure">Estructura</Label>
            {structuresLoading ? (
              <div className="flex h-11 items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" />
                Cargando estructuras...
              </div>
            ) : (
              <Select value={structureId} onValueChange={setStructureId}>
                <SelectTrigger id="coordinator-structure" className={fieldClassName}>
                  <SelectValue placeholder="Sin estructura" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_STRUCTURE}>Sin estructura</SelectItem>
                  {structures
                    .filter((structure) => structure.isActive || structure.id === structureId)
                    .map((structure) => (
                      <SelectItem key={structure.id} value={structure.id}>
                        <span className="inline-flex items-center gap-2">
                          <StructureColorSwatch color={structure.color} />
                          {structure.name}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
            {canCreateStructure &&
              (creatingStructure ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className={`min-w-40 flex-1 ${fieldClassName}`}
                    value={newStructureName}
                    onChange={(event) => setNewStructureName(event.target.value)}
                    placeholder="Nombre de la estructura"
                    maxLength={120}
                    aria-label="Nombre de la nueva estructura"
                  />
                  <input
                    type="color"
                    value={(isHexColor(newStructureColor)
                      ? newStructureColor
                      : DEFAULT_STRUCTURE_COLOR
                    ).toLowerCase()}
                    onChange={(event) =>
                      setNewStructureColor(normalizeHexColor(event.target.value))
                    }
                    className="h-11 w-12 cursor-pointer rounded-lg border border-input bg-background p-1"
                    aria-label="Color de la nueva estructura"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      submitting ||
                      newStructureName.trim().length < 2 ||
                      !isHexColor(newStructureColor)
                    }
                    onClick={() => {
                      void (async () => {
                        const result = await onCreateStructure({
                          name: newStructureName.trim(),
                          color: normalizeHexColor(newStructureColor),
                        });
                        if (!result.success || !result.structure) return;
                        setStructureId(result.structure.id);
                        setNewStructureName('');
                        setNewStructureColor(DEFAULT_STRUCTURE_COLOR);
                        setCreatingStructure(false);
                      })();
                    }}
                  >
                    Agregar
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setCreatingStructure(true)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Nueva estructura
                </Button>
              ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="coordinator-full-name">Nombre completo</Label>
            <Input
              id="coordinator-full-name"
              className={fieldClassName}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              minLength={2}
              maxLength={255}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="coordinator-phone">Teléfono móvil (WhatsApp)</Label>
              <PhoneInputWithCountry
                id="coordinator-phone"
                value={phone}
                onChange={setPhone}
                className={fieldClassName}
                placeholder="Número de WhatsApp"
                invalid={phoneInvalid}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coordinator-email">Correo electrónico</Label>
              <Input
                id="coordinator-email"
                type="email"
                autoComplete="email"
                className={fieldClassName}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isEditing}
                required={!isEditing}
                maxLength={255}
              />
              {isEditing && (
                <p className="text-xs text-muted-foreground">
                  El correo es la identidad de acceso y no es editable.
                </p>
              )}
            </div>
          </div>

          {phoneInvalid && (
            <p role="alert" className="text-xs text-destructive">
              Ingresá un teléfono válido.
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
