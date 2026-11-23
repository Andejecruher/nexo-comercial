'use client';

import { CatalogStepper } from '@/components/admin/electoral-catalog/CatalogStepper';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ElectoralDistrict, ElectoralSection, ElectoralState } from '@/lib/ine-ocr-api';
import { cn } from '@/lib/utils';
import {
  parseSectionOperationalFields,
  type SectionOperationalFields,
} from '@/components/admin/electoral-catalog/catalog-types';
import { AlertCircle, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

type CatalogLevel = 1 | 2 | 3;

export interface CatalogCreateDialogProps {
  open: boolean;
  states: ElectoralState[];
  districts: ElectoralDistrict[];
  sections: ElectoralSection[];
  busy: boolean;
  onClose: () => void;
  onCreateState: (payload: { code: string; name: string }) => Promise<string | undefined>;
  onCreateDistrict: (payload: {
    stateId: string;
    code: string;
    name?: string;
  }) => Promise<string | undefined>;
  onCreateSection: (
    payload: {
      stateId: string;
      districtId: string;
      sectionCode: string;
    } & SectionOperationalFields,
  ) => Promise<string | undefined>;
}

const FORM_ID = 'catalog-create-form';

const fieldClassName =
  'h-11 rounded-lg bg-background shadow-xs focus-visible:border-primary focus-visible:ring-primary/20';

const LEVELS = [
  { id: 1, label: 'Estado' },
  { id: 2, label: 'Distrito' },
  { id: 3, label: 'Sección' },
];

const LEVEL_COPY: Record<
  CatalogLevel,
  { title: string; description: string; listTitle: string; action: string }
> = {
  1: {
    title: 'Alta de estado',
    description: 'Creá el nivel principal de la organización electoral.',
    listTitle: 'Estados registrados',
    action: 'Agregar estado',
  },
  2: {
    title: 'Alta de distrito',
    description: 'Elegí el estado al que pertenece el distrito.',
    listTitle: 'Distritos del estado',
    action: 'Agregar distrito',
  },
  3: {
    title: 'Alta de sección',
    description: 'Elegí el estado y el distrito al que pertenece la sección.',
    listTitle: 'Secciones del distrito',
    action: 'Agregar sección',
  },
};

const normalize = (value: string) => value.trim().toLocaleLowerCase();

const stateLabel = (state: ElectoralState) => `${state.code} · ${state.name}`;
const districtLabel = (district: ElectoralDistrict) =>
  `Distrito ${district.code}${district.name ? ` · ${district.name}` : ''}`;
const sectionLabel = (section: ElectoralSection) => `Sección ${section.sectionCode}`;

export function CatalogCreateDialog({
  open,
  states,
  districts,
  sections,
  busy,
  onClose,
  onCreateState,
  onCreateDistrict,
  onCreateSection,
}: CatalogCreateDialogProps) {
  const [level, setLevel] = useState<CatalogLevel>(1);
  const [created, setCreated] = useState<number[]>([]);
  const [stateId, setStateId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [stateName, setStateName] = useState('');
  const [districtCode, setDistrictCode] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [sectionCode, setSectionCode] = useState('');
  const [pollingStationCount, setPollingStationCount] = useState('');
  const [votesPerStation, setVotesPerStation] = useState('');
  const [nominalList, setNominalList] = useState('');
  const [votesRequired, setVotesRequired] = useState('');
  const [opsError, setOpsError] = useState<string>();

  const activeStates = useMemo(() => states.filter((state) => state.isActive), [states]);
  const activeDistricts = useMemo(
    () => districts.filter((district) => district.isActive && district.stateId === stateId),
    [districts, stateId],
  );

  useEffect(() => {
    if (!open) return;
    setLevel(1);
    setCreated([]);
    setStateCode('');
    setStateName('');
    setDistrictCode('');
    setDistrictName('');
    setSectionCode('');
    setPollingStationCount('');
    setVotesPerStation('');
    setNominalList('');
    setVotesRequired('');
    setOpsError(undefined);
  }, [open]);

  useEffect(() => {
    setStateId((current) =>
      activeStates.some((state) => state.id === current) ? current : (activeStates[0]?.id ?? ''),
    );
  }, [activeStates]);

  useEffect(() => {
    setDistrictId((current) =>
      activeDistricts.some((district) => district.id === current)
        ? current
        : (activeDistricts[0]?.id ?? ''),
    );
  }, [activeDistricts]);

  const duplicateState = stateCode.trim()
    ? states.find((state) => normalize(state.code) === normalize(stateCode))
    : undefined;
  const duplicateDistrict =
    districtCode.trim() && stateId
      ? districts.find(
          (district) =>
            district.stateId === stateId && normalize(district.code) === normalize(districtCode),
        )
      : undefined;
  const duplicateSection =
    sectionCode.trim() && stateId && districtId
      ? sections.find(
          (section) =>
            section.stateId === stateId &&
            section.districtId === districtId &&
            normalize(section.sectionCode) === normalize(sectionCode),
        )
      : undefined;

  const duplicateMessage = ((): string | undefined => {
    const suffix = (isActive: boolean) =>
      isActive ? '' : ' Está inactivo: podés reactivarlo desde la tabla.';
    switch (level) {
      case 1:
        return duplicateState
          ? `Ya existe el estado ${stateLabel(duplicateState)} con ese código.${suffix(duplicateState.isActive)}`
          : undefined;
      case 2:
        return duplicateDistrict
          ? `Ya existe el ${districtLabel(duplicateDistrict).toLocaleLowerCase()} en este estado.${suffix(duplicateDistrict.isActive)}`
          : undefined;
      case 3:
        return duplicateSection
          ? `Ya existe la ${sectionLabel(duplicateSection).toLocaleLowerCase()} en este distrito.${suffix(duplicateSection.isActive)}`
          : undefined;
    }
  })();

  const missingParentMessage = ((): string | undefined => {
    if (level >= 2 && !stateId) return 'Registrá un estado activo para habilitar este nivel.';
    if (level >= 3 && !districtId)
      return 'Registrá un distrito activo en el estado seleccionado para habilitar este nivel.';
    return undefined;
  })();

  const blocked = busy || Boolean(duplicateMessage) || Boolean(missingParentMessage);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blocked) return;

    switch (level) {
      case 1: {
        const createdId = await onCreateState({ code: stateCode.trim(), name: stateName.trim() });
        if (!createdId) return;
        setStateCode('');
        setStateName('');
        setStateId(createdId);
        break;
      }
      case 2: {
        const createdId = await onCreateDistrict({
          stateId,
          code: districtCode.trim(),
          ...(districtName.trim() ? { name: districtName.trim() } : {}),
        });
        if (!createdId) return;
        setDistrictCode('');
        setDistrictName('');
        setDistrictId(createdId);
        break;
      }
      case 3: {
        const operational = parseSectionOperationalFields({
          pollingStationCount,
          votesPerStation,
          nominalList,
          votesRequired,
        });
        if (operational === 'invalid') {
          setOpsError('Los campos operativos deben ser enteros mayores o iguales a 0.');
          return;
        }
        setOpsError(undefined);
        const createdId = await onCreateSection({
          stateId,
          districtId,
          sectionCode: sectionCode.trim(),
          ...operational,
        });
        if (!createdId) return;
        setSectionCode('');
        setPollingStationCount('');
        setVotesPerStation('');
        setNominalList('');
        setVotesRequired('');
        break;
      }
    }

    setCreated((current) => (current.includes(level) ? current : [...current, level]));
  };

  const copy = LEVEL_COPY[level];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        className={cn(
          'flex max-h-[92vh] w-full max-w-[calc(100%-2rem)] flex-col gap-5 overflow-hidden p-0',
          'sm:max-w-3xl',
        )}
        onInteractOutside={(event) => busy && event.preventDefault()}
      >
        <DialogHeader className="border-b px-6 pt-6 pb-5">
          <DialogTitle className="text-lg font-black tracking-tight">
            Alta de catálogo electoral
          </DialogTitle>
          <DialogDescription>
            Cada nivel se registra de forma independiente. Elegí el que necesités y agregá tantos
            registros como quieras sin cerrar el modal.
          </DialogDescription>
          <div className="pt-3">
            <CatalogStepper
              steps={LEVELS}
              current={level}
              completed={created}
              disabled={busy}
              onStepClick={(next) => setLevel(next as CatalogLevel)}
            />
          </div>
        </DialogHeader>

        <div
          className={cn(
            'grid flex-1 gap-6 overflow-y-auto px-6',
            'lg:grid-cols-[minmax(0,1fr)_240px]',
          )}
        >
          <form id={FORM_ID} className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <div>
              <h3 className="text-base font-bold tracking-tight">{copy.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {copy.description}
              </p>
            </div>

            <fieldset
              className="grid gap-4 sm:grid-cols-2"
              disabled={busy || Boolean(missingParentMessage)}
            >
              {level >= 2 && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="create-state">Estado</Label>
                  <Select value={stateId} onValueChange={setStateId}>
                    <SelectTrigger id="create-state" className={fieldClassName}>
                      <SelectValue placeholder="Seleccioná un estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeStates.map((state) => (
                        <SelectItem key={state.id} value={state.id}>
                          {stateLabel(state)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {level >= 3 && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="create-district">Distrito</Label>
                  <Select value={districtId} onValueChange={setDistrictId}>
                    <SelectTrigger id="create-district" className={fieldClassName}>
                      <SelectValue placeholder="Seleccioná un distrito" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeDistricts.map((district) => (
                        <SelectItem key={district.id} value={district.id}>
                          {districtLabel(district)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {level === 1 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="create-state-code">Código</Label>
                    <Input
                      id="create-state-code"
                      className={fieldClassName}
                      value={stateCode}
                      onChange={(event) => setStateCode(event.target.value)}
                      placeholder="Ej. 07"
                      required
                      maxLength={10}
                      aria-invalid={Boolean(duplicateState)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-state-name">Nombre</Label>
                    <Input
                      id="create-state-name"
                      className={fieldClassName}
                      value={stateName}
                      onChange={(event) => setStateName(event.target.value)}
                      placeholder="Ej. Chiapas"
                      required
                      maxLength={120}
                    />
                  </div>
                </>
              )}

              {level === 2 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="create-district-code">Código de distrito</Label>
                    <Input
                      id="create-district-code"
                      className={fieldClassName}
                      value={districtCode}
                      onChange={(event) => setDistrictCode(event.target.value)}
                      placeholder="Ej. 01"
                      required
                      maxLength={20}
                      aria-invalid={Boolean(duplicateDistrict)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-district-name">Nombre opcional</Label>
                    <Input
                      id="create-district-name"
                      className={fieldClassName}
                      value={districtName}
                      onChange={(event) => setDistrictName(event.target.value)}
                      placeholder="Ej. Cintalapa 1"
                      maxLength={120}
                    />
                  </div>
                </>
              )}

              {level === 3 && (
                <>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="create-section-code">Código de sección</Label>
                    <Input
                      id="create-section-code"
                      className={fieldClassName}
                      value={sectionCode}
                      onChange={(event) => setSectionCode(event.target.value)}
                      placeholder="Ej. 0042"
                      required
                      maxLength={20}
                      aria-invalid={Boolean(duplicateSection)}
                    />
                  </div>
                  <SectionOperationalInputs
                    pollingStationCount={pollingStationCount}
                    votesPerStation={votesPerStation}
                    nominalList={nominalList}
                    votesRequired={votesRequired}
                    onPollingStationCountChange={setPollingStationCount}
                    onVotesPerStationChange={setVotesPerStation}
                    onNominalListChange={setNominalList}
                    onVotesRequiredChange={setVotesRequired}
                    idPrefix="create"
                  />
                </>
              )}
            </fieldset>

            {missingParentMessage && (
              <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {missingParentMessage}
              </p>
            )}

            {opsError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                {opsError}
              </p>
            )}

            {duplicateMessage && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                {duplicateMessage}
              </p>
            )}
          </form>

          <aside className="rounded-xl border bg-muted/20" aria-label={copy.listTitle}>
            <p className="border-b px-3 py-2.5 text-xs font-bold tracking-tight">
              {copy.listTitle}
            </p>
            <ExistingList
              items={
                level === 1
                  ? states.map((state) => ({
                      id: state.id,
                      code: state.code,
                      name: state.name,
                      isActive: state.isActive,
                    }))
                  : level === 2
                    ? districts
                        .filter((district) => district.stateId === stateId)
                        .map((district) => ({
                          id: district.id,
                          code: `Distrito ${district.code}`,
                          name: district.name || '—',
                          isActive: district.isActive,
                        }))
                    : sections
                        .filter(
                          (section) =>
                            section.stateId === stateId && section.districtId === districtId,
                        )
                        .map((section) => ({
                          id: section.id,
                          code: `Sección ${section.sectionCode}`,
                          name: `${section.leaders.length} líder(es)`,
                          isActive: section.isActive,
                        }))
              }
            />
          </aside>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cerrar
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={blocked}
            className="gap-2 bg-primary font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md"
          >
            <Plus aria-hidden="true" className="size-4" />
            {busy ? 'Guardando...' : copy.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SectionOperationalInputs({
  pollingStationCount,
  votesPerStation,
  nominalList,
  votesRequired,
  onPollingStationCountChange,
  onVotesPerStationChange,
  onNominalListChange,
  onVotesRequiredChange,
  idPrefix,
  className,
}: {
  pollingStationCount: string;
  votesPerStation: string;
  nominalList: string;
  votesRequired: string;
  onPollingStationCountChange: (value: string) => void;
  onVotesPerStationChange: (value: string) => void;
  onNominalListChange: (value: string) => void;
  onVotesRequiredChange: (value: string) => void;
  idPrefix: string;
  className?: string;
}) {
  return (
    <>
      <div className={cn('space-y-2', className)}>
        <Label htmlFor={`${idPrefix}-polling-station-count`}>Casillas</Label>
        <Input
          id={`${idPrefix}-polling-station-count`}
          className={fieldClassName}
          inputMode="numeric"
          min={0}
          step={1}
          value={pollingStationCount}
          onChange={(event) => onPollingStationCountChange(event.target.value)}
          placeholder="Opcional"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-votes-per-station`}>Votos por casilla</Label>
        <Input
          id={`${idPrefix}-votes-per-station`}
          className={fieldClassName}
          inputMode="numeric"
          min={0}
          step={1}
          value={votesPerStation}
          onChange={(event) => onVotesPerStationChange(event.target.value)}
          placeholder="Opcional"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-nominal-list`}>Lista nominal</Label>
        <Input
          id={`${idPrefix}-nominal-list`}
          className={fieldClassName}
          inputMode="numeric"
          min={0}
          step={1}
          value={nominalList}
          onChange={(event) => onNominalListChange(event.target.value)}
          placeholder="Opcional"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-votes-required`}>Votos necesarios</Label>
        <Input
          id={`${idPrefix}-votes-required`}
          className={fieldClassName}
          inputMode="numeric"
          min={0}
          step={1}
          value={votesRequired}
          onChange={(event) => onVotesRequiredChange(event.target.value)}
          placeholder="Opcional"
        />
      </div>
    </>
  );
}

function ExistingList({
  items,
}: {
  items: Array<{ id: string; code: string; name: string; isActive: boolean }>;
}) {
  if (items.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        Todavía no hay registros en este nivel.
      </p>
    );
  }

  return (
    <ul className="max-h-64 divide-y overflow-y-auto">
      {items.map((item) => (
        <li key={item.id} className="px-3 py-2 text-xs">
          <p
            className={cn('font-semibold', !item.isActive && 'text-muted-foreground line-through')}
          >
            {item.code}
          </p>
          <p className="text-muted-foreground">{item.name}</p>
        </li>
      ))}
    </ul>
  );
}
