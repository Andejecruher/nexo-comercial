'use client';

import { BarrioSelectCombobox } from '@/components/admin/electoral-catalog/BarrioSelectCombobox';
import { CoordinatorSelect } from '@/components/domain/catalogs/CoordinatorSelect';
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
import {
  LEADER_ROLE_LABELS,
  LEADER_ROLES,
  type ElectoralLeader,
  type ElectoralSection,
  type LeaderProfilePayload,
  type LeaderRole,
} from '@/lib/ine-ocr-api';
import { isValidPhoneNumber, toDigitsE164, toE164Phone } from '@/lib/promovido-schema';
import { useEffect, useState, type FormEvent } from 'react';
interface LeaderFormProps {
  open: boolean;
  leader?: ElectoralLeader;
  sections: ElectoralSection[];
  sectionsLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    payload: { sectionId: string; fullName: string } & LeaderProfilePayload,
  ) => Promise<{ success: boolean }>;
}

const fieldClassName =
  'h-11 w-full rounded-lg bg-background shadow-xs focus-visible:border-primary focus-visible:ring-primary/20';

const DEFAULT_LEADER_QUOTA = 10;
const NO_NEIGHBORHOOD = 'none';

export function LeaderForm({
  open,
  leader,
  sections,
  sectionsLoading,
  onOpenChange,
  onSubmit,
}: LeaderFormProps) {
  const [sectionId, setSectionId] = useState('');
  const [coordinatorId, setCoordinatorId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [neighborhoodId, setNeighborhoodId] = useState<string | null>(null);
  const [role, setRole] = useState<LeaderRole>('PROMOTOR_BARRIO');
  const [quota, setQuota] = useState(String(DEFAULT_LEADER_QUOTA));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const isEditing = !!leader;

  useEffect(() => {
    if (!open) return;
    setSectionId(leader?.sectionId ?? '');
    setCoordinatorId(leader?.coordinatorId ?? leader?.coordinator?.id ?? null);
    setFullName(leader?.fullName ?? '');
    setPhone(toE164Phone(leader?.phone ?? ''));
    setEmail(leader?.email ?? '');
    setNeighborhoodId(leader?.neighborhoodId ?? null);
    setRole(leader?.role ?? 'PROMOTOR_BARRIO');
    setQuota(String(leader?.promovidoQuota ?? DEFAULT_LEADER_QUOTA));
    setError(undefined);
  }, [open, leader]);

  useEffect(() => {
    if (isEditing) return;
    setCoordinatorId(null);
    setNeighborhoodId(null);
  }, [sectionId, isEditing]);

  const title = isEditing ? 'Editar líder' : 'Crear líder';
  const phoneInvalid = phone.trim().length > 0 && !isValidPhoneNumber(phone);
  const parsedQuota = ((): number | undefined => {
    const value = Number(quota.trim());
    return Number.isInteger(value) && value >= 1 ? value : undefined;
  })();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!sectionId) return setError('Seleccioná la sección del líder.');
    if (!coordinatorId) return setError('Seleccioná el coordinador del líder.');
    if (cleanName.length < 2)
      return setError('El nombre completo debe tener al menos 2 caracteres.');
    if (phoneInvalid) return setError('Ingresá un teléfono válido.');
    if (!isEditing && !/^\S+@\S+\.\S+$/.test(cleanEmail))
      return setError('Ingresá un correo electrónico válido.');
    setSubmitting(true);
    const result = await onSubmit({
      sectionId,
      fullName: cleanName,
      coordinatorId,
      phone: toDigitsE164(phone) || null,
      email: cleanEmail,
      neighborhoodId: neighborhoodId === NO_NEIGHBORHOOD ? null : neighborhoodId,
      role,
      promovidoQuota: parsedQuota ?? DEFAULT_LEADER_QUOTA,
    });
    setSubmitting(false);
    if (result.success) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Al crear el líder se crea su usuario con rol LIDER y se envía una invitación por correo
            para configurar el acceso a Voz Ciudadana. El coordinador debe pertenecer a la misma
            sección.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="leader-section">Sección electoral</Label>
            {sectionsLoading ? (
              <div className="flex h-11 items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" />
                Cargando secciones...
              </div>
            ) : (
              <Select
                value={sectionId}
                onValueChange={setSectionId}
                disabled={isEditing && !!leader?.sectionId}
              >
                <SelectTrigger id="leader-section" className={fieldClassName}>
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
              <p className="text-xs text-muted-foreground">La sección del líder no es editable.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="leader-coordinator">Coordinador</Label>
            <CoordinatorSelect
              id="leader-coordinator"
              sectionId={sectionId || undefined}
              value={coordinatorId}
              onValueChange={setCoordinatorId}
              isDisabled={!sectionId || submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="leader-full-name">Nombre completo</Label>
            <Input
              id="leader-full-name"
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
              <Label htmlFor="leader-phone">Teléfono móvil (WhatsApp)</Label>
              <PhoneInputWithCountry
                id="leader-phone"
                value={phone}
                onChange={setPhone}
                className={fieldClassName}
                placeholder="Número de WhatsApp"
                invalid={phoneInvalid}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leader-email">Correo electrónico</Label>
              <Input
                id="leader-email"
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="leader-neighborhood">Barrio / Colonia / Localidad</Label>
              <BarrioSelectCombobox
                id="leader-neighborhood"
                value={neighborhoodId}
                seccionId={sectionId || undefined}
                selectedLabel={leader?.neighborhood?.name}
                isDisabled={!sectionId || submitting}
                onChange={(option) => setNeighborhoodId(option?.id ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leader-role">Rol / tipo de líder</Label>
              <Select value={role} onValueChange={(value) => setRole(value as LeaderRole)}>
                <SelectTrigger id="leader-role" className={fieldClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEADER_ROLES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {LEADER_ROLE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="leader-quota">Meta / cuota de promovidos</Label>
            <Input
              id="leader-quota"
              type="number"
              min={1}
              className={fieldClassName}
              value={quota}
              onChange={(event) => setQuota(event.target.value)}
            />
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
