/**
 * CreateGoalModal — Create / edit a precampana goal.
 *
 * Mode is selected by the `goal` prop: when provided the form pre-fills and
 * submits a PATCH; otherwise it creates via POST. Inline validation mirrors
 * the backend contract, including scope binding and cadence.
 */

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type ElectoralLeader, type ElectoralSection, ineOcrApi } from '@/lib/ine-ocr-api';
import {
  type GoalCadence,
  type GoalScope,
  type PrecampanaGoal,
  type PrecampanaGoalPayload,
  precampanaApi,
} from '@/lib/precampana-api';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, edit mode; otherwise create mode. */
  goal?: PrecampanaGoal | null;
  onSaved: () => void;
};

type FormState = {
  title: string;
  target: string;
  scope: GoalScope;
  cadence: GoalCadence;
  sectionId: string;
  leaderId: string;
  startDate: string;
  endDate: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  title: '',
  target: '',
  scope: 'GLOBAL',
  cadence: 'WEEKLY',
  sectionId: '',
  leaderId: '',
  startDate: '',
  endDate: '',
};

const GOAL_CADENCE_LABELS: Record<GoalCadence, string> = {
  CAMPAIGN: 'Campaña',
  MONTHLY: 'Mensual',
  WEEKLY: 'Semanal',
};

const GOAL_SCOPE_LABELS: Record<GoalScope, string> = {
  GLOBAL: 'Todo el equipo',
  SECTION: 'Sección',
  LEADER: 'Líder',
};

function toInputDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  // yyyy-mm-dd in local date (avoid timezone shifts)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toIsoDate(value: string): string {
  if (!value) return '';
  // Treat the user's date input as local; emit an ISO timestamp at 00:00 local.
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return '';
  const date = new Date(y, m - 1, d, 0, 0, 0);
  return date.toISOString();
}

export function CreateGoalModal({ open, onOpenChange, goal, onSaved }: Props) {
  const isEdit = !!goal;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [sections, setSections] = useState<ElectoralSection[]>([]);
  const [leaders, setLeaders] = useState<ElectoralLeader[]>([]);

  useEffect(() => {
    if (!open) return;
    if (goal) {
      setForm({
        title: goal.title,
        target: String(goal.target),
        scope: goal.scope,
        cadence: goal.cadence,
        sectionId: goal.sectionId ?? '',
        leaderId: goal.leaderId ?? '',
        startDate: toInputDate(goal.startDate),
        endDate: toInputDate(goal.endDate),
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setErrors({});

    let active = true;
    setCatalogLoading(true);
    void Promise.all([
      ineOcrApi.catalog.listSections({ limit: 500 }),
      ineOcrApi.catalog.listLeaders({}),
    ]).then(([sectionsResult, leadersResult]) => {
      if (!active) return;
      setSections(sectionsResult.ok ? sectionsResult.data.sections : []);
      setLeaders(leadersResult.ok ? leadersResult.data.leaders : []);
      setCatalogLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, goal]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const updateScope = (scope: GoalScope) => {
    setForm((prev) => ({
      ...prev,
      scope,
      sectionId: scope === 'SECTION' ? prev.sectionId : '',
      leaderId: scope === 'LEADER' ? prev.leaderId : '',
    }));
    setErrors((prev) => ({ ...prev, scope: undefined, sectionId: undefined, leaderId: undefined }));
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};

    if (!form.title.trim()) {
      next.title = 'El título es requerido.';
    } else if (form.title.trim().length > 100) {
      next.title = 'El título no puede superar 100 caracteres.';
    }

    const targetNum = Number(form.target);
    if (!form.target.trim() || Number.isNaN(targetNum)) {
      next.target = 'Ingresá un número válido.';
    } else if (!Number.isInteger(targetNum) || targetNum < 1) {
      next.target = 'La meta debe ser un entero mayor o igual a 1.';
    }

    if (!form.startDate) next.startDate = 'Elegí una fecha de inicio.';
    if (!form.endDate) next.endDate = 'Elegí una fecha de fin.';

    if (form.scope === 'SECTION' && !form.sectionId) {
      next.sectionId = 'Elegí una sección activa.';
    }
    if (form.scope === 'LEADER' && !form.leaderId) {
      next.leaderId = 'Elegí un líder activo.';
    }

    if (form.startDate && form.endDate && form.endDate <= form.startDate) {
      next.endDate = 'La fecha de fin debe ser posterior a la de inicio.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const payload: PrecampanaGoalPayload = {
      title: form.title.trim(),
      target: Number(form.target),
      scope: form.scope,
      cadence: form.cadence,
      sectionId: form.scope === 'SECTION' ? form.sectionId : null,
      leaderId: form.scope === 'LEADER' ? form.leaderId : null,
      startDate: toIsoDate(form.startDate),
      endDate: toIsoDate(form.endDate),
    };

    setSubmitting(true);

    const result = isEdit
      ? await precampanaApi.updateGoal(goal!.id, payload)
      : await precampanaApi.createGoal(payload);

    setSubmitting(false);

    if (result.ok) {
      toast.success(isEdit ? 'Meta actualizada.' : 'Meta creada correctamente.');
      onSaved();
      onOpenChange(false);
    } else {
      toast.error(result.message || 'No se pudo guardar la meta.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-130 bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isEdit ? 'Editar meta' : 'Configurar nueva meta'}
          </DialogTitle>
          <DialogDescription>
            Definí la cadencia, el alcance, el objetivo y el período de la meta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="goal-title" className="text-foreground">
              Título <span className="text-destructive">*</span>
            </Label>
            <Input
              id="goal-title"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="Ej: Meta global de precampaña"
              maxLength={100}
              disabled={submitting}
              aria-invalid={!!errors.title}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          {/* Cadence + scope */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="goal-cadence" className="text-foreground">
                Cadencia <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.cadence}
                onValueChange={(v) => update('cadence', v as GoalCadence)}
                disabled={submitting}
              >
                <SelectTrigger id="goal-cadence" className="w-full">
                  <SelectValue placeholder="Cadencia" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GOAL_CADENCE_LABELS) as GoalCadence[]).map((cadence) => (
                    <SelectItem key={cadence} value={cadence}>
                      {GOAL_CADENCE_LABELS[cadence]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-scope" className="text-foreground">
                Alcance <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.scope}
                onValueChange={(value) => updateScope(value as GoalScope)}
                disabled={submitting}
              >
                <SelectTrigger id="goal-scope" className="w-full">
                  <SelectValue placeholder="Alcance" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GOAL_SCOPE_LABELS) as GoalScope[]).map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {GOAL_SCOPE_LABELS[scope]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.scope === 'SECTION' && (
            <div className="space-y-2">
              <Label htmlFor="goal-section" className="text-foreground">
                Sección <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.sectionId || undefined}
                onValueChange={(value) => update('sectionId', value)}
                disabled={submitting || catalogLoading}
              >
                <SelectTrigger
                  id="goal-section"
                  className="w-full"
                  aria-invalid={!!errors.sectionId}
                >
                  <SelectValue
                    placeholder={catalogLoading ? 'Cargando secciones...' : 'Elegí una sección'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      Sección {section.sectionCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.sectionId && <p className="text-xs text-destructive">{errors.sectionId}</p>}
            </div>
          )}

          {form.scope === 'LEADER' && (
            <div className="space-y-2">
              <Label htmlFor="goal-leader" className="text-foreground">
                Líder <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.leaderId || undefined}
                onValueChange={(value) => update('leaderId', value)}
                disabled={submitting || catalogLoading}
              >
                <SelectTrigger id="goal-leader" className="w-full" aria-invalid={!!errors.leaderId}>
                  <SelectValue
                    placeholder={catalogLoading ? 'Cargando líderes...' : 'Elegí un líder'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {leaders.map((leader) => (
                    <SelectItem key={leader.id} value={leader.id}>
                      {leader.fullName} · Sección {leader.section.sectionCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.leaderId && <p className="text-xs text-destructive">{errors.leaderId}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="goal-target" className="text-foreground">
              Meta <span className="text-destructive">*</span>
            </Label>
            <Input
              id="goal-target"
              type="number"
              min={1}
              step={1}
              value={form.target}
              onChange={(e) => update('target', e.target.value)}
              placeholder="Ej: 1000"
              disabled={submitting}
              aria-invalid={!!errors.target}
            />
            {errors.target && <p className="text-xs text-destructive">{errors.target}</p>}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="goal-start" className="text-foreground">
                Fecha de inicio <span className="text-destructive">*</span>
              </Label>
              <Input
                id="goal-start"
                type="date"
                value={form.startDate}
                onChange={(e) => update('startDate', e.target.value)}
                disabled={submitting}
                aria-invalid={!!errors.startDate}
              />
              {errors.startDate && <p className="text-xs text-destructive">{errors.startDate}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-end" className="text-foreground">
                Fecha de fin <span className="text-destructive">*</span>
              </Label>
              <Input
                id="goal-end"
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={(e) => update('endDate', e.target.value)}
                disabled={submitting}
                aria-invalid={!!errors.endDate}
              />
              {errors.endDate && <p className="text-xs text-destructive">{errors.endDate}</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando...' : isEdit ? 'Actualizar meta' : 'Crear meta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
