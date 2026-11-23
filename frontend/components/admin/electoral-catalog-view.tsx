'use client';

import { CatalogCreateDialog } from '@/components/admin/electoral-catalog/CatalogCreateDialog';
import {
  CatalogDeleteDialog,
  CatalogEditDialog,
} from '@/components/admin/electoral-catalog/CatalogEditDialog';
import { CatalogHierarchyPanel } from '@/components/admin/electoral-catalog/CatalogHierarchyPanel';
import { CatalogTable } from '@/components/admin/electoral-catalog/CatalogTable';
import type {
  CatalogEditPayload,
  CatalogTarget,
} from '@/components/admin/electoral-catalog/catalog-types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ineOcrApi,
  type ElectoralDistrict,
  type ElectoralSection,
  type ElectoralState,
} from '@/lib/ine-ocr-api';
import { CircleHelp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type CatalogAction = 'state' | 'district' | 'section';
type SavingAction = CatalogAction | 'mutation';
type Selection = { stateId?: string; districtId?: string; sectionId?: string };
type SelectedRow = { type: CatalogTarget['type']; id: string };

function safeErrorMessage(status: number, fallback: string): string {
  if (status === 0) return 'No se pudo conectar con el servidor.';
  if (status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.';
  if (status === 403) return 'No tenés permisos para administrar el catálogo electoral.';
  if (status === 404) return 'El registro ya no existe o fue eliminado.';
  if (status === 409) return fallback || 'El cambio entra en conflicto con el catálogo existente.';
  if (status === 400 || status === 422) return fallback;
  return fallback || 'No se pudo guardar el cambio. Intentá nuevamente.';
}

export function ElectoralCatalogView() {
  const [states, setStates] = useState<ElectoralState[]>([]);
  const [districts, setDistricts] = useState<ElectoralDistrict[]>([]);
  const [sections, setSections] = useState<ElectoralSection[]>([]);
  const [selectedStateId, setSelectedStateId] = useState('');
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SavingAction>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<SelectedRow>();
  const [editTarget, setEditTarget] = useState<CatalogTarget>();
  const [deleteTarget, setDeleteTarget] = useState<CatalogTarget>();

  const loadCatalog = useCallback(async (preferred: Selection = {}): Promise<boolean> => {
    setLoading(true);
    const [statesResult, districtsResult, sectionsResult] = await Promise.all([
      ineOcrApi.catalog.listStates(true),
      ineOcrApi.catalog.listDistricts(undefined, true),
      ineOcrApi.catalog.listSections({ includeInactive: true, limit: 500 }),
    ]);
    setLoading(false);

    const failed = [statesResult, districtsResult, sectionsResult].find((result) => !result.ok);
    if (failed && !failed.ok) {
      toast.error('No se pudo actualizar el catálogo', {
        description: safeErrorMessage(failed.status, failed.message),
      });
      return false;
    }

    if (!statesResult.ok || !districtsResult.ok || !sectionsResult.ok) {
      return false;
    }

    const nextStates = statesResult.data.states;
    const nextDistricts = districtsResult.data.districts;
    const nextSections = sectionsResult.data.sections;
    const activeStates = nextStates.filter((state) => state.isActive);
    const nextStateId =
      activeStates.find((state) => state.id === preferred.stateId)?.id ?? activeStates[0]?.id ?? '';
    const availableDistricts = nextDistricts.filter(
      (district) => district.isActive && district.stateId === nextStateId,
    );
    const nextDistrictId =
      availableDistricts.find((district) => district.id === preferred.districtId)?.id ??
      availableDistricts[0]?.id ??
      '';
    const availableSections = nextSections.filter(
      (section) =>
        section.isActive &&
        section.stateId === nextStateId &&
        section.districtId === nextDistrictId,
    );
    const nextSectionId =
      availableSections.find((section) => section.id === preferred.sectionId)?.id ??
      availableSections[0]?.id ??
      '';

    setStates(nextStates);
    setDistricts(nextDistricts);
    setSections(nextSections);
    setSelectedStateId(nextStateId);
    setSelectedDistrictId(nextDistrictId);
    setSelectedSectionId(nextSectionId);
    return true;
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const createState = async (payload: {
    code: string;
    name: string;
  }): Promise<string | undefined> => {
    setSaving('state');
    const result = await ineOcrApi.catalog.createState(payload);
    setSaving(undefined);
    if (!result.ok) {
      toast.error('No se pudo agregar el estado', {
        description: safeErrorMessage(result.status, result.message),
      });
      return undefined;
    }
    if (await loadCatalog({ stateId: result.data.state.id })) {
      toast.success('Estado agregado', {
        description: 'Ya podés usarlo al registrar distritos.',
      });
    }
    return result.data.state.id;
  };

  const createDistrict = async (payload: {
    stateId: string;
    code: string;
    name?: string;
  }): Promise<string | undefined> => {
    setSaving('district');
    const result = await ineOcrApi.catalog.createDistrict(payload);
    setSaving(undefined);
    if (!result.ok) {
      toast.error('No se pudo agregar el distrito', {
        description: safeErrorMessage(result.status, result.message),
      });
      return undefined;
    }
    if (
      await loadCatalog({
        stateId: payload.stateId,
        districtId: result.data.district.id,
      })
    ) {
      toast.success('Distrito agregado', {
        description: 'Ya podés usarlo al registrar secciones.',
      });
    }
    return result.data.district.id;
  };

  const createSection = async (payload: {
    stateId: string;
    districtId: string;
    sectionCode: string;
    pollingStationCount?: number | null;
    votesPerStation?: number | null;
    nominalList?: number | null;
    votesRequired?: number | null;
  }): Promise<string | undefined> => {
    setSaving('section');
    const result = await ineOcrApi.catalog.createSection(payload);
    setSaving(undefined);
    if (!result.ok) {
      toast.error('No se pudo agregar la sección', {
        description: safeErrorMessage(result.status, result.message),
      });
      return undefined;
    }
    if (
      await loadCatalog({
        stateId: payload.stateId,
        districtId: payload.districtId,
        sectionId: result.data.section.id,
      })
    ) {
      toast.success('Sección agregada', {
        description: 'Ya podés usarla al registrar coordinadores y líderes.',
      });
    }
    return result.data.section.id;
  };

  const currentSelection = {
    stateId: selectedStateId,
    districtId: selectedDistrictId,
    sectionId: selectedSectionId,
  };

  const updateTarget = async (
    target: CatalogTarget,
    payload: CatalogEditPayload,
  ): Promise<boolean> => {
    setSaving('mutation');
    const result = await updateCatalogTarget(target, payload);
    setSaving(undefined);
    if (!result.ok) {
      toast.error('No se pudo actualizar el registro', {
        description: safeErrorMessage(result.status, result.message),
      });
      return false;
    }
    await loadCatalog(currentSelection);
    toast.success('Registro actualizado correctamente.');
    return true;
  };

  const deleteCatalogTarget = async (target: CatalogTarget): Promise<boolean> => {
    setSaving('mutation');
    const result = await deactivateCatalogTarget(target);
    setSaving(undefined);
    if (!result.ok) {
      toast.error('No se pudo desactivar el registro', {
        description: safeErrorMessage(result.status, result.message),
      });
      return false;
    }
    await loadCatalog(currentSelection);
    toast.success('Registro desactivado correctamente.');
    return true;
  };

  const reactivateTarget = async (target: CatalogTarget) => {
    setSaving('mutation');
    const result = await updateCatalogTarget(target, { isActive: true });
    setSaving(undefined);
    if (!result.ok) {
      toast.error('No se pudo reactivar el registro', {
        description: safeErrorMessage(result.status, result.message),
      });
      return;
    }
    await loadCatalog(currentSelection);
    toast.success('Registro reactivado correctamente.');
  };

  const selectedTarget = useMemo<CatalogTarget | undefined>(() => {
    if (!selectedRow) return undefined;
    switch (selectedRow.type) {
      case 'state': {
        const item = states.find((state) => state.id === selectedRow.id);
        return item ? { type: 'state', item } : undefined;
      }
      case 'district': {
        const item = districts.find((district) => district.id === selectedRow.id);
        return item ? { type: 'district', item } : undefined;
      }
      case 'section': {
        const item = sections.find((section) => section.id === selectedRow.id);
        return item ? { type: 'section', item } : undefined;
      }
    }
  }, [districts, sections, selectedRow, states]);

  const busy = loading || saving !== undefined;

  return (
    <main
      className="h-full space-y-7 overflow-y-auto bg-muted/20 p-4 md:p-6 lg:p-8"
      aria-labelledby="electoral-catalog-title"
    >
      <header className="relative overflow-hidden rounded-2xl border bg-card px-5 py-6 shadow-sm md:px-7">
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-primary" />
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <h1
              id="electoral-catalog-title"
              className="text-2xl font-black tracking-tight text-foreground"
            >
              Catálogo electoral
            </h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Ayuda sobre el catálogo electoral"
                  className="size-7 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
                >
                  <CircleHelp aria-hidden="true" className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs leading-relaxed">
                Registrá manualmente la jerarquía Estado, Distrito y Sección para la revisión de
                credenciales INE.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Construí la jerarquía paso a paso desde el alta guiada y administrá los registros
            existentes desde un solo lugar.
          </p>
        </div>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {loading ? 'Cargando catálogo electoral...' : 'Catálogo electoral actualizado.'}
      </p>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <CatalogTable
          states={states}
          districts={districts}
          sections={sections}
          loading={loading}
          busy={busy}
          selectedRowId={selectedRow?.id}
          onCreate={() => setCreateOpen(true)}
          onSelectRow={(target) => setSelectedRow({ type: target.type, id: target.item.id })}
          onRefresh={() => void loadCatalog(currentSelection)}
          onEdit={setEditTarget}
          onDelete={setDeleteTarget}
          onReactivate={(target) => void reactivateTarget(target)}
        />

        <CatalogHierarchyPanel
          target={selectedTarget}
          states={states}
          districts={districts}
          sections={sections}
        />
      </div>

      <CatalogCreateDialog
        open={createOpen}
        states={states}
        districts={districts}
        sections={sections}
        busy={busy}
        onClose={() => {
          setCreateOpen(false);
          void loadCatalog(currentSelection);
        }}
        onCreateState={createState}
        onCreateDistrict={createDistrict}
        onCreateSection={createSection}
      />

      <CatalogEditDialog
        target={editTarget}
        states={states}
        districts={districts}
        busy={saving === 'mutation'}
        onClose={() => setEditTarget(undefined)}
        onSubmit={updateTarget}
      />
      <CatalogDeleteDialog
        target={deleteTarget}
        busy={saving === 'mutation'}
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={deleteCatalogTarget}
      />
    </main>
  );
}

async function updateCatalogTarget(target: CatalogTarget, payload: CatalogEditPayload) {
  switch (target.type) {
    case 'state':
      return ineOcrApi.catalog.updateState(target.item.id, {
        code: payload.code,
        name: payload.name ?? undefined,
        isActive: payload.isActive,
      });
    case 'district':
      return ineOcrApi.catalog.updateDistrict(target.item.id, {
        stateId: payload.stateId,
        code: payload.code,
        name: payload.name,
        isActive: payload.isActive,
      });
    case 'section':
      return ineOcrApi.catalog.updateSection(target.item.id, {
        stateId: payload.stateId,
        districtId: payload.districtId,
        sectionCode: payload.sectionCode,
        isActive: payload.isActive,
        pollingStationCount: payload.pollingStationCount,
        votesPerStation: payload.votesPerStation,
        nominalList: payload.nominalList,
        votesRequired: payload.votesRequired,
      });
  }
}

async function deactivateCatalogTarget(target: CatalogTarget) {
  switch (target.type) {
    case 'state':
      return ineOcrApi.catalog.deleteState(target.item.id);
    case 'district':
      return ineOcrApi.catalog.deleteDistrict(target.item.id);
    case 'section':
      return ineOcrApi.catalog.deleteSection(target.item.id);
  }
}
