'use client';

import {
  BarrioSelectCombobox,
  formatBarrioLabel,
} from '@/components/admin/electoral-catalog/BarrioSelectCombobox';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import {
  ineOcrApi,
  type NeighborhoodMatch,
  type NeighborhoodMatchCandidate,
} from '@/lib/ine-ocr-api';
import {
  normalizeBirthDate,
  normalizeCurp,
  normalizePhone,
  normalizeVoterKey,
  promovidoSchema,
  toE164Phone,
  type PromovidoFormValues,
} from '@/lib/promovido-schema';
import { promovidosApi } from '@/lib/promovidos-api';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Check, Pencil } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';

export type DetectedField = {
  voterKey?: string;
  curp?: string;
  firstName?: string;
  paternalLastName?: string;
  maternalLastName?: string;
  birthDate?: string;
  sex?: 'H' | 'M';
  address?: string;
  neighborhood?: string;
  neighborhoodId?: string;
  locality?: string;
  municipality?: string;
  postalCode?: string;
  state?: string;
  phone?: string;
  sectionId?: string;
  leaderId?: string;
};

type CatalogSection = {
  id: string;
  sectionCode: string;
  state: { id: string; name: string };
  district: { id: string; code: string };
  leaders: Array<{ id: string; fullName: string }>;
};

type CatalogLeader = {
  id: string;
  fullName: string;
  sectionId: string;
  section: { sectionCode: string; state: { name: string }; district: { code: string } };
};

export type PromovidoFormProps = {
  mode: 'create' | 'edit';
  initialValues?: Partial<PromovidoFormValues>;
  detected?: DetectedField;
  rescanDetected?: DetectedField;
  promovidoId?: string;
  sections: CatalogSection[];
  leaders: CatalogLeader[];
  loadingCatalogs: boolean;
  onSubmit: (values: PromovidoFormValues) => Promise<{ success: boolean; error?: string }>;
  onCancel: () => void;
  submitting: boolean;
};

/** Etiqueta de una candidata OCR: sin municipio, dos homónimas son indistinguibles. */
function candidateLabel(candidate: NeighborhoodMatchCandidate | undefined): string {
  return candidate ? formatBarrioLabel(candidate.name, candidate.municipality) : '';
}

export function PromovidoForm({
  mode,
  initialValues,
  detected,
  rescanDetected,
  promovidoId,
  sections,
  leaders,
  loadingCatalogs,
  onSubmit,
  onCancel,
  submitting,
}: PromovidoFormProps) {
  const formId = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    leaderName: string;
    sectionCode: string;
  } | null>(null);
  const [checkingVoterKey, setCheckingVoterKey] = useState(false);
  const [neighborhoodMatch, setNeighborhoodMatch] = useState<NeighborhoodMatch | null>(null);
  const [rescanNeighborhoodMatch, setRescanNeighborhoodMatch] = useState<NeighborhoodMatch | null>(
    null,
  );

  const defaultValues: Partial<PromovidoFormValues> = useMemo(
    () => ({
      firstName:
        (mode === 'create' ? detected?.firstName : undefined) ?? initialValues?.firstName ?? '',
      paternalLastName:
        (mode === 'create' ? detected?.paternalLastName : undefined) ??
        initialValues?.paternalLastName ??
        '',
      maternalLastName:
        (mode === 'create' ? detected?.maternalLastName : undefined) ??
        initialValues?.maternalLastName ??
        '',
      birthDate: (mode === 'create' ? detected?.birthDate : undefined)
        ? normalizeBirthDate(detected!.birthDate!)
        : normalizeBirthDate(initialValues?.birthDate),
      sex: (mode === 'create' ? detected?.sex : undefined) ?? initialValues?.sex ?? undefined,
      curp: (mode === 'create' ? detected?.curp : undefined)
        ? normalizeCurp(detected!.curp!)
        : (initialValues?.curp ?? ''),
      voterKey: (mode === 'create' ? detected?.voterKey : undefined)
        ? normalizeVoterKey(detected!.voterKey!)
        : (initialValues?.voterKey ?? ''),
      address: (mode === 'create' ? detected?.address : undefined) ?? initialValues?.address ?? '',
      neighborhood:
        (mode === 'create' ? detected?.neighborhood : undefined) ??
        initialValues?.neighborhood ??
        '',
      // OCR text never carries a trusted catalog identifier; only a safe match may set one below.
      neighborhoodId: initialValues?.neighborhoodId ?? '',
      locality:
        (mode === 'create' ? detected?.locality : undefined) ?? initialValues?.locality ?? '',
      municipality:
        (mode === 'create' ? detected?.municipality : undefined) ??
        initialValues?.municipality ??
        '',
      state: (mode === 'create' ? detected?.state : undefined) ?? initialValues?.state ?? '',
      sectionId:
        (mode === 'create' ? detected?.sectionId : undefined) ?? initialValues?.sectionId ?? '',
      leaderId:
        (mode === 'create' ? detected?.leaderId : undefined) ?? initialValues?.leaderId ?? '',
      phone: toE164Phone(
        (mode === 'create' ? detected?.phone : undefined) ?? initialValues?.phone ?? '',
      ),
      isActive: initialValues?.isActive ?? true,
      observations: initialValues?.observations ?? '',
    }),
    [detected, initialValues, mode],
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setFocus,
    reset,
    formState: { errors },
  } = useForm<PromovidoFormValues>({
    defaultValues,
    resolver: zodResolver(
      promovidoSchema as unknown as Parameters<typeof zodResolver>[0],
    ) as Resolver<PromovidoFormValues>,
    mode: 'onBlur',
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const sectionId = useWatch({ control, name: 'sectionId' });
  const leaderId = useWatch({ control, name: 'leaderId' });
  const voterKey = useWatch({ control, name: 'voterKey' });
  const curp = useWatch({ control, name: 'curp' });
  const phone = useWatch({ control, name: 'phone' });
  const neighborhood = useWatch({ control, name: 'neighborhood' });
  const neighborhoodId = useWatch({ control, name: 'neighborhoodId' });
  const isActive = useWatch({ control, name: 'isActive' });

  const availableLeaders = useMemo(() => {
    if (!sectionId) return leaders;
    return leaders.filter((l) => l.sectionId === sectionId);
  }, [leaders, sectionId]);

  useEffect(() => {
    if (mode === 'edit') return;
    if (sectionId && leaderId && !availableLeaders.find((l) => l.id === leaderId)) {
      setValue('leaderId', '');
    }
  }, [availableLeaders, sectionId, leaderId, setValue, mode]);

  useEffect(() => {
    let cancelled = false;
    if (!voterKey || voterKey.length < 12) {
      setConflict(null);
      setCheckingVoterKey(false);
      return;
    }
    const normalized = normalizeVoterKey(voterKey);
    const handler = setTimeout(async () => {
      setCheckingVoterKey(true);
      try {
        const result = await promovidosApi.checkVoterKey(normalized, promovidoId);
        if (cancelled) return;
        if (result?.ok && result.data?.conflict) {
          setConflict({
            leaderName: result.data.conflict.leaderName,
            sectionCode: result.data.conflict.sectionCode,
          });
        } else {
          setConflict(null);
        }
      } finally {
        if (!cancelled) setCheckingVoterKey(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handler);
    };
  }, [voterKey, promovidoId]);

  useEffect(() => {
    let cancelled = false;
    const ocrNeighborhood = mode === 'create' ? detected?.neighborhood?.trim() : undefined;
    if (!ocrNeighborhood) {
      setNeighborhoodMatch(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      const result = await ineOcrApi.matchNeighborhood({
        rawValue: ocrNeighborhood,
        sectionId: sectionId || undefined,
        ...(detected?.municipality?.trim() ? { municipality: detected.municipality.trim() } : {}),
        ...(detected?.postalCode?.trim() ? { postalCode: detected.postalCode.trim() } : {}),
      });
      if (cancelled) return;
      setNeighborhoodMatch(result.ok ? result.data.match : null);
      const bestMatch = result.ok
        ? (result.data.match.bestMatch ?? result.data.match.matchPrincipal)
        : undefined;
      if (bestMatch && !neighborhoodId) {
        const { id, name, sectionId: matchedSectionId } = bestMatch;
        setValue('neighborhoodId', id);
        setValue('neighborhood', name);
        if (matchedSectionId) setValue('sectionId', matchedSectionId);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    detected?.neighborhood,
    detected?.municipality,
    detected?.postalCode,
    mode,
    neighborhoodId,
    sectionId,
    setValue,
  ]);

  useEffect(() => {
    let cancelled = false;
    const rawValue = rescanDetected?.neighborhood?.trim();
    if (!rawValue) {
      setRescanNeighborhoodMatch(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      const result = await ineOcrApi.matchNeighborhood({
        rawValue,
        sectionId: sectionId || undefined,
        ...(rescanDetected?.municipality?.trim()
          ? { municipality: rescanDetected.municipality.trim() }
          : {}),
        ...(rescanDetected?.postalCode?.trim()
          ? { postalCode: rescanDetected.postalCode.trim() }
          : {}),
      });
      if (!cancelled) setRescanNeighborhoodMatch(result.ok ? result.data.match : null);
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    rescanDetected?.neighborhood,
    rescanDetected?.municipality,
    rescanDetected?.postalCode,
    sectionId,
  ]);

  const submitHandler = async (values: PromovidoFormValues) => {
    if (conflict) return;
    setServerError(null);
    if (mode === 'create' && !detected && !values.phone) {
      setServerError('El teléfono es obligatorio en la captura manual.');
      return;
    }
    const result = await onSubmit({
      ...values,
      voterKey: normalizeVoterKey(values.voterKey),
      curp: normalizeCurp(values.curp),
      phone: values.phone ? normalizePhone(values.phone) : undefined,
    });
    if (!result.success && result.error) {
      setServerError(result.error);
    }
  };

  const isDetected = (field: keyof DetectedField): boolean => {
    return detected?.[field] !== undefined && detected[field] !== '';
  };

  const normalizedDetected = (field: keyof DetectedField, value?: string): string | null => {
    if (!value) return null;
    if (field === 'voterKey') return normalizeVoterKey(value);
    if (field === 'curp') return normalizeCurp(value);
    if (field === 'phone') return toE164Phone(value);
    return value;
  };

  const isModified = (field: keyof DetectedField, value: string | undefined): boolean => {
    const detectedValue = detected?.[field];
    if (!detectedValue) return false;
    const current = field === 'phone' ? toE164Phone(value) : (value ?? '');
    return current !== (normalizedDetected(field, detectedValue) ?? '');
  };

  const FieldHint = ({
    field,
    value,
  }: {
    field: keyof DetectedField;
    value: string | undefined;
  }) => {
    if (!isDetected(field)) return null;
    if (isModified(field, value)) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-600" aria-hidden="true">
          <Pencil className="h-3 w-3" /> Modificado
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600" aria-hidden="true">
        <Check className="h-3 w-3" /> Detectado automáticamente
      </span>
    );
  };

  const focusFirstError = useCallback(() => {
    const firstErrorField = Object.keys(errors)[0] as keyof PromovidoFormValues | undefined;
    if (firstErrorField) setFocus(firstErrorField);
  }, [errors, setFocus]);

  const renderError = (message?: string) =>
    message ? (
      <p className="text-xs text-destructive" role="alert">
        {message}
      </p>
    ) : null;

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(submitHandler, focusFirstError)}
      className="space-y-6"
      noValidate
    >
      {serverError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}

      {conflict && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 wrap-break-word">
              <p className="font-medium">Promovido ya registrado</p>
              <p className="mt-1">
                La clave de elector ya se encuentra registrada con otro líder. No es posible
                registrar nuevamente a esta persona.
              </p>
              <p className="mt-1 text-xs">
                Líder actual: <strong>{conflict.leaderName}</strong>
                <br />
                Sección: <strong>{conflict.sectionCode}</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Identidad</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">Nombre *</Label>
            <Input
              id="firstName"
              aria-invalid={!!errors.firstName}
              aria-describedby={errors.firstName ? 'firstName-error' : undefined}
              {...register('firstName')}
            />
            {renderError(errors.firstName?.message)}
          </div>
          <div className="space-y-2">
            <Label htmlFor="paternalLastName">Apellido paterno *</Label>
            <Input
              id="paternalLastName"
              aria-invalid={!!errors.paternalLastName}
              {...register('paternalLastName')}
            />
            {renderError(errors.paternalLastName?.message)}
          </div>
          <div className="space-y-2">
            <Label htmlFor="maternalLastName">Apellido materno</Label>
            <Input id="maternalLastName" {...register('maternalLastName')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birthDate">Fecha de nacimiento</Label>
            <Input id="birthDate" type="date" {...register('birthDate')} />
            {renderError(errors.birthDate?.message)}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sex">Sexo</Label>
            <Controller
              name="sex"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger id="sex" className="w-full">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="H">Hombre</SelectItem>
                    <SelectItem value="M">Mujer</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {renderError(errors.sex?.message)}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="curp">CURP *</Label>
              <FieldHint field="curp" value={curp} />
            </div>
            <Input
              id="curp"
              aria-invalid={!!errors.curp}
              {...register('curp', {
                onChange: (e) => {
                  e.target.value = normalizeCurp(e.target.value);
                },
              })}
            />
            {renderError(errors.curp?.message)}
            {mode === 'create' && !detected?.curp && !errors.curp && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                El OCR no detectó la CURP. Ingresala manualmente.
              </p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="voterKey">Clave de elector *</Label>
              <FieldHint field="voterKey" value={voterKey} />
              {checkingVoterKey && (
                <span className="text-xs text-muted-foreground">Verificando…</span>
              )}
            </div>
            <Input
              id="voterKey"
              aria-invalid={!!errors.voterKey || !!conflict}
              aria-describedby={conflict ? 'voterKey-conflict' : undefined}
              {...register('voterKey', {
                onChange: (e) => {
                  e.target.value = normalizeVoterKey(e.target.value);
                },
              })}
            />
            {renderError(errors.voterKey?.message)}
            {mode === 'create' && !detected?.voterKey && !errors.voterKey && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                El OCR no detectó la clave de elector. Ingresala manualmente.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Domicilio</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address">Calle y número</Label>
            <Input id="address" {...register('address')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="neighborhoodCatalog">Colonia *</Label>
            <BarrioSelectCombobox
              id="neighborhoodCatalog"
              ariaLabel="Buscar colonia del catálogo"
              value={neighborhoodId || null}
              selectedLabel={neighborhood}
              seccionId={sectionId || undefined}
              requireSection={false}
              allowNone={false}
              placeholder="Buscar colonia..."
              emptyLabel="No se encontraron colonias"
              isDisabled={submitting}
              {...(errors.neighborhoodId?.message ? { error: errors.neighborhoodId.message } : {})}
              onChange={(option) => {
                setValue('neighborhoodId', option?.id ?? '', { shouldDirty: true });
                setValue('neighborhood', option?.name ?? '', { shouldDirty: true });
              }}
            />
            {(neighborhoodMatch?.bestMatch ?? neighborhoodMatch?.matchPrincipal) && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Coincidencia OCR preseleccionada:{' '}
                {candidateLabel(neighborhoodMatch.bestMatch ?? neighborhoodMatch.matchPrincipal)}.
                Podés cambiarla.
              </p>
            )}
            {(rescanNeighborhoodMatch?.bestMatch ?? rescanNeighborhoodMatch?.matchPrincipal) && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <p>
                  Nueva sugerencia OCR:{' '}
                  {candidateLabel(
                    rescanNeighborhoodMatch.bestMatch ?? rescanNeighborhoodMatch.matchPrincipal,
                  )}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    const bestMatch =
                      rescanNeighborhoodMatch.bestMatch ?? rescanNeighborhoodMatch.matchPrincipal;
                    if (
                      !bestMatch ||
                      !window.confirm('¿Aplicar esta sugerencia OCR al territorio revisado?')
                    )
                      return;
                    setValue('neighborhoodId', bestMatch.id, { shouldDirty: true });
                    setValue('neighborhood', bestMatch.name, { shouldDirty: true });
                    if (bestMatch.sectionId && bestMatch.sectionId !== sectionId) {
                      setValue('sectionId', bestMatch.sectionId, { shouldDirty: true });
                      setValue('leaderId', '', { shouldDirty: true });
                    }
                  }}
                >
                  Aplicar sugerencia OCR
                </Button>
              </div>
            )}
            {neighborhoodMatch &&
              !neighborhoodMatch.matchPrincipal &&
              detected?.neighborhood?.trim() && (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                  <p className="font-medium">Lectura OCR sin coincidencia segura</p>
                  <p className="mt-1 text-muted-foreground">{detected.neighborhood.trim()}</p>
                </div>
              )}
            {neighborhoodMatch?.requiresManualDecision && !neighborhoodMatch.matchPrincipal && (
              <p className="text-xs text-muted-foreground">
                Buscá y seleccioná una colonia del catálogo para continuar.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="locality">Localidad</Label>
            <Input id="locality" {...register('locality')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="municipality">Municipio</Label>
            <Input id="municipality" {...register('municipality')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">Estado</Label>
            <Input id="state" {...register('state')} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Gestión</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sectionId">Sección revisada *</Label>
            <Controller
              name="sectionId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(nextSectionId) => {
                    field.onChange(nextSectionId);
                    if (nextSectionId !== sectionId) {
                      setValue('leaderId', '', { shouldDirty: true });
                    }
                  }}
                  disabled={loadingCatalogs}
                >
                  <SelectTrigger
                    id="sectionId"
                    className="w-full"
                    aria-invalid={!!errors.sectionId}
                  >
                    <SelectValue placeholder="Seleccionar sección" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.sectionCode} — {s.state.name}, Distrito {s.district.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {renderError(errors.sectionId?.message)}
          </div>
          <div className="space-y-2">
            <Label htmlFor="leaderId">Líder activo *</Label>
            <Controller
              name="leaderId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={!sectionId || loadingCatalogs}
                >
                  <SelectTrigger id="leaderId" className="w-full" aria-invalid={!!errors.leaderId}>
                    <SelectValue
                      placeholder={
                        sectionId ? 'Seleccionar líder' : 'Seleccioná una sección primero'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLeaders.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {renderError(errors.leaderId?.message)}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="phone">Teléfono</Label>
              <FieldHint field="phone" value={phone} />
            </div>
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <PhoneInputWithCountry
                  id="phone"
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!errors.phone}
                  defaultCountry="MX"
                />
              )}
            />
            {renderError(errors.phone?.message)}
          </div>
          <div className="flex items-center gap-3 rounded-xl border p-4">
            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <Switch id="isActive" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            <div className="grid gap-0.5">
              <Label htmlFor="isActive" className="cursor-pointer">
                Vigencia: {isActive ? 'Activo' : 'Inactivo'}
              </Label>
              <p className="text-xs text-muted-foreground">
                Un promovido inactivo no aparece en los filtros por defecto.
              </p>
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="observations">Observaciones</Label>
            <textarea
              id="observations"
              rows={3}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              {...register('observations')}
            />
          </div>
        </div>
      </fieldset>

      <div className="sticky bottom-0 z-10 mt-4 flex items-center justify-end gap-3 border-t bg-background/95 p-4 backdrop-blur-sm sm:static sm:mt-6 sm:border-0 sm:p-0">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting} size="lg">
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || !!conflict} size="lg">
          {submitting ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Guardar promovido'}
        </Button>
      </div>
    </form>
  );
}
