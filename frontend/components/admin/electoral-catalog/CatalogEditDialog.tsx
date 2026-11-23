'use client';

import { SectionOperationalInputs } from '@/components/admin/electoral-catalog/CatalogCreateDialog';
import {
  catalogTargetLabel,
  parseSectionOperationalFields,
  type CatalogEditPayload,
  type CatalogTarget,
} from '@/components/admin/electoral-catalog/catalog-types';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ElectoralDistrict, ElectoralState } from '@/lib/ine-ocr-api';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

interface CatalogEditDialogProps {
  target?: CatalogTarget;
  states: ElectoralState[];
  districts: ElectoralDistrict[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (target: CatalogTarget, payload: CatalogEditPayload) => Promise<boolean>;
}

const fieldClassName =
  'h-11 w-full rounded-lg bg-background shadow-xs focus-visible:border-primary focus-visible:ring-primary/20';

export function CatalogEditDialog({
  target,
  states,
  districts,
  busy,
  onClose,
  onSubmit,
}: CatalogEditDialogProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [stateId, setStateId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [pollingStationCount, setPollingStationCount] = useState('');
  const [votesPerStation, setVotesPerStation] = useState('');
  const [nominalList, setNominalList] = useState('');
  const [votesRequired, setVotesRequired] = useState('');
  const [opsError, setOpsError] = useState<string>();

  useEffect(() => {
    if (!target) return;
    switch (target.type) {
      case 'state':
        setCode(target.item.code);
        setName(target.item.name);
        break;
      case 'district':
        setCode(target.item.code);
        setName(target.item.name ?? '');
        setStateId(target.item.stateId);
        break;
      case 'section':
        setCode(target.item.sectionCode);
        setStateId(target.item.stateId);
        setDistrictId(target.item.districtId);
        setPollingStationCount(target.item.pollingStationCount?.toString() ?? '');
        setVotesPerStation(target.item.votesPerStation?.toString() ?? '');
        setNominalList(target.item.nominalList?.toString() ?? '');
        setVotesRequired(target.item.votesRequired?.toString() ?? '');
        setOpsError(undefined);
        break;
    }
  }, [target]);

  const availableDistricts = useMemo(
    () =>
      districts.filter(
        (district) =>
          district.stateId === stateId && (district.isActive || district.id === districtId),
      ),
    [districtId, districts, stateId],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target) return;

    let payload: CatalogEditPayload;
    switch (target.type) {
      case 'state':
        payload = { code: code.trim(), name: name.trim() };
        break;
      case 'district':
        payload = { stateId, code: code.trim(), name: name.trim() || null };
        break;
      case 'section': {
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
        payload = {
          stateId,
          districtId,
          sectionCode: code.trim(),
          ...operational,
        };
        break;
      }
    }
    if (await onSubmit(target, payload)) onClose();
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar registro</DialogTitle>
          <DialogDescription>
            Actualizá los datos de {target ? catalogTargetLabel(target) : 'este registro'}.
          </DialogDescription>
        </DialogHeader>

        {target && (
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <fieldset className="space-y-4" disabled={busy}>
              {target.type === 'district' && (
                <CatalogStateSelect
                  states={states}
                  value={stateId}
                  onValueChange={(value) => {
                    setStateId(value);
                    const firstDistrict = districts.find(
                      (district) => district.stateId === value && district.isActive,
                    );
                    setDistrictId(firstDistrict?.id ?? '');
                  }}
                />
              )}

              {target.type === 'section' && (
                <>
                  <CatalogStateSelect
                    states={states}
                    value={stateId}
                    onValueChange={(value) => {
                      setStateId(value);
                      const firstDistrict = districts.find(
                        (district) => district.stateId === value && district.isActive,
                      );
                      setDistrictId(firstDistrict?.id ?? '');
                    }}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="edit-district">Distrito</Label>
                    <Select value={districtId} onValueChange={setDistrictId}>
                      <SelectTrigger id="edit-district" className={fieldClassName}>
                        <SelectValue placeholder="Seleccioná un distrito" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableDistricts.map((district) => (
                          <SelectItem key={district.id} value={district.id}>
                            Distrito {district.code}
                            {district.name ? ` · ${district.name}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {
                <div className="space-y-2">
                  <Label htmlFor="edit-code">
                    {target.type === 'section' ? 'Código de sección' : 'Código'}
                  </Label>
                  <Input
                    id="edit-code"
                    className={fieldClassName}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    required
                    maxLength={target.type === 'state' ? 10 : 20}
                  />
                </div>
              }

              {target.type !== 'section' && (
                <div className="space-y-2">
                  <Label htmlFor="edit-name">
                    {target.type === 'district' ? 'Nombre opcional' : 'Nombre'}
                  </Label>
                  <Input
                    id="edit-name"
                    className={fieldClassName}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required={target.type !== 'district'}
                    maxLength={120}
                  />
                </div>
              )}

              {target.type === 'section' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <SectionOperationalInputs
                    pollingStationCount={pollingStationCount}
                    votesPerStation={votesPerStation}
                    nominalList={nominalList}
                    votesRequired={votesRequired}
                    onPollingStationCountChange={setPollingStationCount}
                    onVotesPerStationChange={setVotesPerStation}
                    onNominalListChange={setNominalList}
                    onVotesRequiredChange={setVotesRequired}
                    idPrefix="edit"
                  />
                </div>
              )}
              {opsError && (
                <p role="alert" className="text-xs text-destructive">
                  {opsError}
                </p>
              )}
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy} className="bg-primary hover:bg-primary/90">
                {busy ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CatalogStateSelect({
  states,
  value,
  onValueChange,
}: {
  states: ElectoralState[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="edit-state">Estado</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id="edit-state" className={fieldClassName}>
          <SelectValue placeholder="Seleccioná un estado" />
        </SelectTrigger>
        <SelectContent>
          {states.map((state) => (
            <SelectItem key={state.id} value={state.id} disabled={!state.isActive}>
              {state.code} · {state.name}
              {!state.isActive ? ' (inactivo)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface CatalogDeleteDialogProps {
  target?: CatalogTarget;
  busy: boolean;
  onClose: () => void;
  onConfirm: (target: CatalogTarget) => Promise<boolean>;
}

export function CatalogDeleteDialog({
  target,
  busy,
  onClose,
  onConfirm,
}: CatalogDeleteDialogProps) {
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desactivar registro?</AlertDialogTitle>
          <AlertDialogDescription>
            Vas a desactivar{' '}
            <strong>{target ? catalogTargetLabel(target) : 'este registro'}</strong>. El registro
            permanecerá en el historial y podrás reactivarlo después.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || !target}
            onClick={(event) => {
              event.preventDefault();
              if (!target) return;
              void onConfirm(target).then((success) => success && onClose());
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? 'Desactivando...' : 'Desactivar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
