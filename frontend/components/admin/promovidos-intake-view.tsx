'use client';

import { PromovidoCameraCapture } from '@/components/admin/promovidos/promovido-camera-capture';
import { PromovidoCards } from '@/components/admin/promovidos/promovido-card';
import { PromovidoDetailDialog } from '@/components/admin/promovidos/promovido-detail-dialog';
import { PromovidoFilters } from '@/components/admin/promovidos/promovido-filters';
import type { DetectedField } from '@/components/admin/promovidos/promovido-form';
import { PromovidoForm } from '@/components/admin/promovidos/promovido-form';
import { PromovidoIntakeModePicker } from '@/components/admin/promovidos/promovido-intake-mode-picker';
import { PromovidoTable } from '@/components/admin/promovidos/promovido-table';
import { PaginationControls } from '@/components/domain/catalogs/PaginationControls';
import { Button } from '@/components/ui/button';
import { ExportButton } from '@/components/admin/ExportButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/components/ui/use-mobile';
import { ineOcrApi, type IneUpload } from '@/lib/ine-ocr-api';
import { mapPromovidoToFormValues } from '@/lib/promovido-mapper';
import { promovidosApi, type PromovidoListItem } from '@/lib/promovidos-api';
import { Loader2, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

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

type Filters = {
  q: string;
  leaderId?: string;
  sex?: 'H' | 'M';
  sectionId?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 20;
const ALLOWED_CREDENTIAL_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_CREDENTIAL_BYTES = 10 * 1024 * 1024;

function useDebounce(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function detectedFromUpload(upload: IneUpload, useRescan = false): DetectedField {
  const f = useRescan ? (upload.rescanFields ?? upload.fields) : upload.fields;
  const singleCandidate =
    (useRescan ? upload.rescanSectionCandidates : upload.sectionCandidates)?.length === 1
      ? (useRescan ? upload.rescanSectionCandidates : upload.sectionCandidates)?.[0]
      : undefined;
  return {
    firstName: f.firstName,
    paternalLastName: f.paternalLastName,
    maternalLastName: f.maternalLastName,
    birthDate: f.birthDate,
    sex:
      f.sex === 'HOMBRE' || f.sex === 'H'
        ? 'H'
        : f.sex === 'MUJER' || f.sex === 'M'
          ? 'M'
          : undefined,
    curp: f.curp,
    voterKey: f.voterKey,
    address: f.address,
    neighborhood: f.neighborhood,
    locality: f.locality,
    municipality: f.municipality,
    postalCode: f.postalCode,
    state: f.state,
    sectionId: singleCandidate?.id,
    leaderId:
      singleCandidate && singleCandidate.leaders.length === 1
        ? singleCandidate.leaders[0].id
        : undefined,
  };
}

function ResponsiveContainer({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={className}>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function PromovidosIntakeView() {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<Filters>({
    q: '',
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const debouncedQ = useDebounce(filters.q);

  const [items, setItems] = useState<PromovidoListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [leaders, setLeaders] = useState<CatalogLeader[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);

  const [choiceOpen, setChoiceOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedPromovido, setSelectedPromovido] = useState<PromovidoListItem | undefined>();
  const [detected, setDetected] = useState<DetectedField | undefined>();
  const [rescanDetected, setRescanDetected] = useState<DetectedField | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const [ocrOpen, setOcrOpen] = useState(false);
  const [frontFile, setFrontFile] = useState<File | undefined>();
  const [ocrUpload, setOcrUpload] = useState<IneUpload | undefined>();
  const [ocrUploading, setOcrUploading] = useState(false);
  const [ocrPolling, setOcrPolling] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItemId, setDetailItemId] = useState<string | undefined>();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await promovidosApi.list({
      q: debouncedQ || undefined,
      leaderId: filters.leaderId,
      sex: filters.sex,
      sectionId: filters.sectionId,
      isActive: filters.isActive,
      page: filters.page,
      pageSize: filters.pageSize,
    });
    if (result.ok) {
      setItems(result.data.items);
      setTotalCount(result.data.totalCount);
      setHasNextPage(result.data.hasNextPage);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [
    debouncedQ,
    filters.leaderId,
    filters.sex,
    filters.sectionId,
    filters.isActive,
    filters.page,
    filters.pageSize,
  ]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    async function loadCatalogs() {
      setLoadingCatalogs(true);
      const [sectionsResult, leadersResult] = await Promise.all([
        ineOcrApi.catalog.listSections({ includeInactive: false, limit: 500 }),
        ineOcrApi.catalog.listLeaders({ includeInactive: false }),
      ]);
      if (sectionsResult.ok) setSections(sectionsResult.data.sections);
      if (leadersResult.ok) setLeaders(leadersResult.data.leaders);
      setLoadingCatalogs(false);
    }
    loadCatalogs();
  }, []);

  useEffect(() => {
    if (!ocrUpload || !['queued', 'processing'].includes(ocrUpload.status)) return;
    setOcrPolling(true);
    const timer = window.setInterval(async () => {
      const result = await ineOcrApi.getUpload(ocrUpload.id);
      if (result.ok) {
        setOcrUpload(result.data.upload);
        if (result.data.upload.status === 'review_ready') {
          window.clearInterval(timer);
          setOcrPolling(false);
          if (result.data.upload.rescanFields) {
            setRescanDetected(detectedFromUpload(result.data.upload, true));
          } else {
            setDetected(detectedFromUpload(result.data.upload));
          }
          setOcrOpen(false);
          setFormMode('create');
          setFormOpen(true);
        }
        if (result.data.upload.status === 'failed') {
          window.clearInterval(timer);
          setOcrPolling(false);
          setOcrError('No se pudo procesar la credencial.');
          toast.error('No se pudo procesar la credencial.');
        }
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [ocrUpload]);

  const handleSearch = (q: string) => {
    setFilters((prev) => ({ ...prev, q, page: 1 }));
  };

  const applyFilters = (patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch, page: 1 }));
  };

  const goPage = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const openCreate = () => {
    setSelectedPromovido(undefined);
    setDetected(undefined);
    setRescanDetected(undefined);
    setFormMode('create');
    setChoiceOpen(true);
  };

  const openManual = () => {
    setChoiceOpen(false);
    setDetected(undefined);
    setRescanDetected(undefined);
    setOcrUpload(undefined);
    setOcrError(null);
    setFrontFile(undefined);
    setFormMode('create');
    setFormOpen(true);
  };

  const startOcrUpload = async (file: File) => {
    setOcrUploading(true);
    setOcrError(null);
    const result = await ineOcrApi.upload(file, undefined);
    setOcrUploading(false);
    if (!result.ok) {
      setOcrError(result.message);
      toast.error(result.message);
      return;
    }
    setOcrUpload(result.data.upload);
  };

  const handleCredentialFile = (file: File) => {
    if (!ALLOWED_CREDENTIAL_TYPES.includes(file.type)) {
      toast.error('Formato no admitido. Usá una imagen JPG o PNG, o un PDF.');
      return;
    }
    if (file.size > MAX_CREDENTIAL_BYTES) {
      toast.error('El archivo supera el límite de 10 MB.');
      return;
    }
    setChoiceOpen(false);
    setDetected(undefined);
    setRescanDetected(undefined);
    setOcrUpload(undefined);
    setOcrError(null);
    setFrontFile(file);
    setOcrOpen(true);
    startOcrUpload(file);
  };

  const openWebcam = () => {
    setChoiceOpen(false);
    setCameraOpen(true);
  };

  const handleWebcamCapture = (file: File) => {
    setCameraOpen(false);
    handleCredentialFile(file);
  };

  const retryOcrUpload = async () => {
    if (!ocrUpload) return;
    const result = await ineOcrApi.retry(ocrUpload.id);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setRescanDetected(undefined);
    setOcrError(null);
    setOcrUpload(result.data.upload);
  };

  const handleFormSubmit = async (values: {
    firstName: string;
    paternalLastName: string;
    maternalLastName?: string;
    birthDate?: string;
    sex?: 'H' | 'M';
    curp: string;
    voterKey: string;
    address?: string;
    neighborhood?: string;
    neighborhoodId?: string;
    locality?: string;
    municipality?: string;
    state?: string;
    sectionId: string;
    leaderId: string;
    phone?: string;
    isActive?: boolean;
    observations?: string;
  }) => {
    setSubmitting(true);
    const payload = {
      ...values,
      isActive: values.isActive ?? true,
    };
    let result;
    if (formMode === 'edit' && selectedPromovido) {
      result = await promovidosApi.update(selectedPromovido.id, payload);
    } else if (ocrUpload?.status === 'review_ready') {
      const review = await ineOcrApi.review(ocrUpload.id, {
        sectionId: values.sectionId,
        leaderId: values.leaderId,
        manualPhone: values.phone || undefined,
        neighborhoodId: values.neighborhoodId,
        fields: {
          firstName: values.firstName,
          paternalLastName: values.paternalLastName,
          ...(values.maternalLastName ? { maternalLastName: values.maternalLastName } : {}),
          ...(values.birthDate ? { birthDate: values.birthDate } : {}),
          ...(values.sex ? { sex: values.sex } : {}),
          curp: values.curp,
          voterKey: values.voterKey,
          ...(values.address ? { address: values.address } : {}),
          ...(values.neighborhood ? { neighborhood: values.neighborhood } : {}),
          ...(values.locality ? { locality: values.locality } : {}),
          ...(values.municipality ? { municipality: values.municipality } : {}),
          ...(values.state ? { state: values.state } : {}),
        },
      });
      result = review.ok ? await ineOcrApi.confirm(ocrUpload.id) : review;
    } else {
      result = await promovidosApi.create(payload);
    }
    setSubmitting(false);
    if (result.ok) {
      toast.success(
        formMode === 'edit'
          ? 'Promovido actualizado.'
          : ocrUpload?.status === 'review_ready'
            ? 'Credencial confirmada y ciudadano sincronizado en CRM.'
            : 'Promovido y ciudadano guardados.',
      );
      setFormOpen(false);
      setDetected(undefined);
      setRescanDetected(undefined);
      setOcrUpload(undefined);
      loadList();
      return { success: true };
    }
    return { success: false, error: result.message };
  };

  const handleEdit = (item: PromovidoListItem) => {
    setSelectedPromovido(item);
    setDetected(undefined);
    setRescanDetected(undefined);
    setFormMode('edit');
    setFormOpen(true);
  };

  const handleView = (item: PromovidoListItem) => {
    setDetailItemId(item.id);
    setDetailOpen(true);
  };

  const initialValues = useMemo(() => {
    if (formMode === 'edit' && selectedPromovido) {
      return mapPromovidoToFormValues(selectedPromovido);
    }
    return undefined;
  }, [formMode, selectedPromovido]);

  return (
    <main className="h-full overflow-y-auto p-4 sm:p-6" aria-labelledby="promovidos-title">
      <header className="mb-4 sm:mb-6">
        <h1 id="promovidos-title" className="text-xl font-black text-foreground">
          Promovidos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administración de promovidos con captura manual y por credencial.
        </p>
      </header>

      <section className="mb-4 space-y-4 sm:mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar promovido…"
              value={filters.q}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
              aria-label="Buscar promovido"
            />
          </div>
          <Button
            onClick={openCreate}
            className="w-full sm:w-auto"
            size={isMobile ? 'lg' : 'default'}
          >
            <Plus className="mr-2 h-4 w-4" />
            Agregar promovido
          </Button>
          <ExportButton
            module="promoted"
            filters={{
              q: debouncedQ || undefined,
              leaderId: filters.leaderId,
              sex: filters.sex,
              sectionId: filters.sectionId,
              isActive: filters.isActive,
            }}
          />
        </div>

        <div className="hidden rounded-xl border bg-card p-4 sm:block">
          <PromovidoFilters
            value={filters}
            onChange={applyFilters}
            sections={sections}
            leaders={leaders}
            loading={loadingCatalogs}
          />
        </div>

        <div className="sm:hidden">
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full" size="lg">
                Filtros
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[80vh]">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
                <SheetDescription>Filtrá la lista de promovidos</SheetDescription>
              </SheetHeader>
              <div className="px-4 py-4">
                <PromovidoFilters
                  value={filters}
                  onChange={applyFilters}
                  sections={sections}
                  leaders={leaders}
                  loading={loadingCatalogs}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <section className="space-y-4" aria-label="Listado de promovidos">
        <div className="hidden sm:block">
          <PromovidoTable items={items} loading={loading} onEdit={handleEdit} onView={handleView} />
        </div>
        <div className="sm:hidden">
          <PromovidoCards items={items} loading={loading} onEdit={handleEdit} onView={handleView} />
        </div>

        <PaginationControls
          currentPage={filters.page}
          hasNextPage={hasNextPage}
          hasPreviousPage={filters.page > 1}
          totalCount={totalCount}
          loading={loading}
          onNext={() => goPage(filters.page + 1)}
          onPrevious={() => goPage(Math.max(1, filters.page - 1))}
          onFirst={() => goPage(1)}
        />
      </section>

      <ResponsiveContainer
        open={choiceOpen}
        onOpenChange={setChoiceOpen}
        title="Agregar promovido"
        description="Elegí el modo de captura"
        className="sm:max-w-md"
      >
        <PromovidoIntakeModePicker
          onFileSelected={handleCredentialFile}
          onWebcam={openWebcam}
          onManual={openManual}
        />
      </ResponsiveContainer>

      <PromovidoCameraCapture
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={handleWebcamCapture}
        onBack={() => {
          setCameraOpen(false);
          setChoiceOpen(true);
        }}
      />

      <ResponsiveContainer
        open={ocrOpen}
        onOpenChange={(open) => {
          setOcrOpen(open);
          if (!open) setOcrError(null);
        }}
        title="Procesando credencial"
        description="Estamos leyendo el frente de la credencial."
        className="sm:max-w-md"
      >
        <div className="space-y-4">
          {frontFile && (
            <p className="truncate text-sm text-muted-foreground" title={frontFile.name}>
              {frontFile.name}
            </p>
          )}
          <p className="flex items-center gap-2 text-sm" role="status">
            {(ocrUploading || ocrPolling) && (
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            )}
            {ocrError
              ? 'No se pudo completar el proceso.'
              : ocrUploading
                ? 'Subiendo la imagen…'
                : ocrPolling
                  ? 'Procesando la credencial…'
                  : 'Preparando el envío…'}
          </p>
          {ocrError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {ocrError}
            </div>
          )}
          {ocrError && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => frontFile && startOcrUpload(frontFile)}
                disabled={!frontFile || ocrUploading}
                className="w-full sm:flex-1"
                size="lg"
              >
                Reintentar
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setOcrOpen(false);
                  setOcrError(null);
                  setFrontFile(undefined);
                  setChoiceOpen(true);
                }}
                className="w-full sm:flex-1"
                size="lg"
              >
                Elegir otra imagen
              </Button>
            </div>
          )}
        </div>
      </ResponsiveContainer>

      <ResponsiveContainer
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setDetected(undefined);
            setRescanDetected(undefined);
            setOcrUpload(undefined);
          }
        }}
        title={
          formMode === 'edit'
            ? 'Editar promovido'
            : ocrUpload?.status === 'review_ready'
              ? 'Revisar y confirmar credencial'
              : 'Nuevo promovido'
        }
        description={
          formMode === 'edit'
            ? 'Modificá los datos y guardá los cambios.'
            : ocrUpload?.status === 'review_ready'
              ? 'Revisá la credencial, confirmá el barrio y verificá la vista previa de CRM antes de confirmar.'
              : 'Completá el formulario. Se creará o actualizará el ciudadano en CRM de forma atómica.'
        }
        className="sm:max-w-3xl"
      >
        <div className="-mx-4 max-h-[calc(100vh-180px)] space-y-4 overflow-y-auto px-4 sm:-mx-6 sm:max-h-[70vh] sm:px-6">
          {formMode === 'create' && ocrUpload?.status === 'review_ready' && (
            <div className="min-w-0 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <p className="font-medium">Vista previa CRM</p>
              <p className="mt-1 text-muted-foreground wrap-break-word">
                {ocrUpload.crmPreview?.status === 'existing'
                  ? `Se actualizará el ciudadano existente: ${[ocrUpload.crmPreview.citizen?.name, ocrUpload.crmPreview.citizen?.lastName].filter(Boolean).join(' ')}.`
                  : ocrUpload.crmPreview?.status === 'new'
                    ? 'Se creará un ciudadano nuevo en CRM.'
                    : ocrUpload.crmPreview?.status === 'invalid'
                      ? 'El OCR no detectó identidad suficiente. Re-escané la credencial o ingresá manualmente la clave de elector o la CURP.'
                      : ocrUpload.crmPreview?.status === 'conflict'
                        ? 'La clave de elector y la CURP resuelven ciudadanos distintos. Requiere revisión manual.'
                        : 'La clave de elector se usa primero; la CURP solo como respaldo. Si discrepan, el sistema detiene el alta para revisión manual.'}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={retryOcrUpload}
                disabled={ocrPolling}
              >
                Re-escanear credencial
              </Button>
            </div>
          )}
          {formMode === 'edit' && selectedPromovido && (
            <div className="min-w-0 rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Registro actual</p>
              <p className="mt-1 text-muted-foreground wrap-break-word">
                Sección <strong>{selectedPromovido.section.sectionCode}</strong> · Líder{' '}
                <strong>{selectedPromovido.leader.fullName}</strong>
              </p>
            </div>
          )}
          <PromovidoForm
            mode={formMode}
            initialValues={initialValues}
            detected={detected}
            rescanDetected={rescanDetected}
            promovidoId={formMode === 'edit' ? selectedPromovido?.id : undefined}
            sections={sections}
            leaders={leaders}
            loadingCatalogs={loadingCatalogs}
            onSubmit={handleFormSubmit}
            onCancel={() => setFormOpen(false)}
            submitting={submitting}
          />
        </div>
      </ResponsiveContainer>

      <PromovidoDetailDialog
        promovidoId={detailItemId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={(detail) => {
          setDetailOpen(false);
          handleEdit(detail);
        }}
      />
    </main>
  );
}
