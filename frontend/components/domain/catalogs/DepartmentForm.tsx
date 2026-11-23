'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type {
  Department,
  DepartmentDayOfWeek,
  DepartmentScheduleDay,
  DepartmentScheduleException,
  DepartmentExceptionRecurrenceType,
  DepartmentScheduleExceptionType,
} from '@/lib/catalog-api';
import {
  formatExceptionRecurrence,
  getRecurrenceStatus,
  isValidMonthDay,
} from '@/lib/department-exceptions';
import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface DepartmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department?: Department;
  onSubmit: (data: {
    slug: string;
    name: string;
    description?: string;
    isActive?: boolean;
    keywords?: string[];
    schedule?: DepartmentScheduleDay[];
    scheduleExceptions?: DepartmentScheduleException[];
  }) => Promise<{ success: boolean; error?: string }>;
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAYS: Array<{ value: DepartmentDayOfWeek; label: string }> = [
  { value: 'MONDAY', label: 'Lunes' },
  { value: 'TUESDAY', label: 'Martes' },
  { value: 'WEDNESDAY', label: 'Miércoles' },
  { value: 'THURSDAY', label: 'Jueves' },
  { value: 'FRIDAY', label: 'Viernes' },
  { value: 'SATURDAY', label: 'Sábado' },
  { value: 'SUNDAY', label: 'Domingo' },
];
const RECURRENCE_LABELS: Record<DepartmentExceptionRecurrenceType, string> = {
  NONE: 'No se repite',
  YEARLY: 'Se repite cada año',
  WEEKLY: 'Se repite cada semana',
  SPECIFIC_WEEKDAYS: 'Se repite en días específicos',
};
const MONTHS = [
  ['1', 'Enero'],
  ['2', 'Febrero'],
  ['3', 'Marzo'],
  ['4', 'Abril'],
  ['5', 'Mayo'],
  ['6', 'Junio'],
  ['7', 'Julio'],
  ['8', 'Agosto'],
  ['9', 'Septiembre'],
  ['10', 'Octubre'],
  ['11', 'Noviembre'],
  ['12', 'Diciembre'],
] as const;
const EXCEPTION_LABELS: Record<DepartmentScheduleExceptionType, string> = {
  PARTIALLY_OPEN: 'Parcialmente abierto',
  PARTIALLY_CLOSED: 'Parcialmente cerrado',
  FULLY_CLOSED: 'Completamente cerrado',
};
const emptySchedule = (): DepartmentScheduleDay[] =>
  DAYS.map((d) => ({ dayOfWeek: d.value, isOpen: false, intervals: [] }));
const validIntervals = (items: Array<{ startTime: string; endTime: string }>) => {
  const sorted = [...items].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const item of sorted)
    if (!item.startTime || !item.endTime || item.startTime >= item.endTime) return false;
  for (let i = 1; i < sorted.length; i += 1)
    if (sorted[i].startTime < sorted[i - 1].endTime) return false;
  return true;
};

export function DepartmentForm({ open, onOpenChange, department, onSubmit }: DepartmentFormProps) {
  const isEdit = !!department;
  const isGeneral = department?.slug === 'general';
  const [form, setForm] = useState({
    slug: '',
    name: '',
    description: '',
    isActive: true,
    keywords: [] as string[],
    keywordInput: '',
    schedule: emptySchedule(),
    scheduleExceptions: [] as DepartmentScheduleException[],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (department) {
      const loaded = emptySchedule().map(
        (day) => department.schedule?.find((d) => d.dayOfWeek === day.dayOfWeek) ?? day,
      );
      setForm({
        slug: department.slug,
        name: department.name,
        description: department.description ?? '',
        isActive: department.isActive,
        keywords: [...department.keywords],
        keywordInput: '',
        schedule: loaded,
        scheduleExceptions: department.scheduleExceptions ?? [],
      });
    } else {
      setForm({
        slug: '',
        name: '',
        description: '',
        isActive: true,
        keywords: [],
        keywordInput: '',
        schedule: emptySchedule(),
        scheduleExceptions: [],
      });
    }
  }, [department, open]);

  const validate = (): boolean => {
    if (
      !form.slug.trim() ||
      form.slug.trim().length < 2 ||
      form.slug.length > 100 ||
      !SLUG_REGEX.test(form.slug)
    ) {
      toast.error('El slug debe ser kebab-case y tener entre 2 y 100 caracteres');
      return false;
    }
    if (!form.name.trim() || form.name.trim().length < 2 || form.name.length > 255) {
      toast.error('El nombre debe tener entre 2 y 255 caracteres');
      return false;
    }
    if (form.description && form.description.length > 4000) {
      toast.error('La descripción no puede superar 4000 caracteres');
      return false;
    }
    for (const day of form.schedule) {
      if (!day.isOpen && day.intervals.length > 0) {
        toast.error(
          `${DAYS.find((d) => d.value === day.dayOfWeek)?.label}: un día cerrado no puede tener intervalos`,
        );
        return false;
      }
      if (day.isOpen && !validIntervals(day.intervals)) {
        toast.error(
          `${DAYS.find((d) => d.value === day.dayOfWeek)?.label}: hay horarios incompletos, invertidos o solapados`,
        );
        return false;
      }
    }
    for (let i = 0; i < form.scheduleExceptions.length; i += 1) {
      const ex = form.scheduleExceptions[i];
      const recurrenceType = ex.recurrenceType ?? 'NONE';
      if (
        recurrenceType === 'NONE' &&
        (!ex.startDate || !ex.endDate || ex.startDate > ex.endDate)
      ) {
        toast.error('Revisa el periodo de las excepciones no recurrentes');
        return false;
      }
      if (recurrenceType !== 'NONE') {
        if (
          !ex.recurrenceStartsOn ||
          (ex.recurrenceEndsOn && ex.recurrenceStartsOn > ex.recurrenceEndsOn)
        ) {
          toast.error('Revisa la vigencia de las recurrencias');
          return false;
        }
        if (recurrenceType === 'YEARLY') {
          if (
            !isValidMonthDay(ex.yearlyStartMonth, ex.yearlyStartDay) ||
            !isValidMonthDay(ex.yearlyEndMonth, ex.yearlyEndDay)
          ) {
            toast.error('La recurrencia anual contiene un día inválido para el mes');
            return false;
          }
        } else if (!ex.weekdays || ex.weekdays.length === 0) {
          toast.error('Selecciona al menos un día de la semana para la recurrencia');
          return false;
        }
      }
      if (ex.type === 'FULLY_CLOSED' && ex.intervals.length > 0) {
        toast.error('Completamente cerrado no acepta horarios');
        return false;
      }
      if (
        ex.type !== 'FULLY_CLOSED' &&
        (ex.intervals.length === 0 || !validIntervals(ex.intervals))
      ) {
        toast.error(`${EXCEPTION_LABELS[ex.type]} requiere horarios válidos`);
        return false;
      }
      for (let j = i + 1; j < form.scheduleExceptions.length; j += 1) {
        const other = form.scheduleExceptions[j];
        if (
          (ex.recurrenceType ?? 'NONE') === 'NONE' &&
          (other.recurrenceType ?? 'NONE') === 'NONE' &&
          ex.startDate &&
          ex.endDate &&
          other.startDate &&
          other.endDate &&
          ex.startDate <= other.endDate &&
          other.startDate <= ex.endDate
        ) {
          toast.error('Hay excepciones puntuales con periodos solapados');
          return false;
        }
      }
    }
    return true;
  };

  const addKeyword = () => {
    const keyword = form.keywordInput.trim().toLowerCase();
    if (!keyword) return;
    if (keyword.length > 100 || form.keywords.includes(keyword) || form.keywords.length >= 50) {
      toast.error('Keyword inválida, duplicada o límite alcanzado');
      return;
    }
    setForm((p) => ({ ...p, keywords: [...p.keywords, keyword], keywordInput: '' }));
  };
  const updateDay = (
    dayOfWeek: DepartmentDayOfWeek,
    updater: (day: DepartmentScheduleDay) => DepartmentScheduleDay,
  ) =>
    setForm((p) => ({
      ...p,
      schedule: p.schedule.map((d) => (d.dayOfWeek === dayOfWeek ? updater(d) : d)),
    }));
  const updateException = (
    index: number,
    updater: (ex: DepartmentScheduleException) => DepartmentScheduleException,
  ) =>
    setForm((p) => ({
      ...p,
      scheduleExceptions: p.scheduleExceptions.map((ex, i) => (i === index ? updater(ex) : ex)),
    }));

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    const result = await onSubmit({
      slug: form.slug.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      isActive: form.isActive,
      keywords: form.keywords.length ? form.keywords : undefined,
      schedule: form.schedule,
      scheduleExceptions: form.scheduleExceptions,
    });
    setSubmitting(false);
    if (result.success) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[880px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar departamento' : 'Nuevo departamento'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <section className="rounded-xl border p-4 space-y-4">
            <h3 className="font-semibold">Información general</h3>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value.toLowerCase() }))}
                disabled={submitting || isGeneral || isEdit}
              />
              <p className="text-xs text-muted-foreground">
                El slug es inmutable tras crear el departamento.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords</Label>
              <div className="flex gap-2">
                <Input
                  id="keywords"
                  value={form.keywordInput}
                  onChange={(e) => setForm((p) => ({ ...p, keywordInput: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                  disabled={submitting}
                />
                <Button type="button" onClick={addKeyword} disabled={submitting}>
                  Agregar
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {form.keywords.map((k) => (
                  <Badge key={k} variant="secondary" className="gap-1">
                    {k}
                    <button
                      type="button"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          keywords: p.keywords.filter((item) => item !== k),
                        }))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="isActive">Estado</Label>
                <p className="text-xs text-muted-foreground">
                  Un departamento inactivo nunca aparece disponible.
                </p>
              </div>
              <Switch
                id="isActive"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((p) => ({ ...p, isActive: checked }))}
                disabled={submitting || (isGeneral && form.isActive)}
              />
            </div>
          </section>

          <section className="rounded-xl border p-4 space-y-4">
            <div>
              <h3 className="font-semibold">Horarios de atención</h3>
              <p className="text-sm text-muted-foreground">
                Formato 24 horas. El inicio es inclusivo y el fin exclusivo; no se permiten cruces
                de medianoche.
              </p>
            </div>
            {form.schedule.map((day) => (
              <div key={day.dayOfWeek} className="rounded-lg bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{DAYS.find((d) => d.value === day.dayOfWeek)?.label}</Label>
                  <Switch
                    checked={day.isOpen}
                    onCheckedChange={(checked) =>
                      updateDay(day.dayOfWeek, (d) => ({
                        ...d,
                        isOpen: checked,
                        intervals: checked ? d.intervals : [],
                      }))
                    }
                  />
                </div>
                {day.intervals.map((interval, idx) => (
                  <div
                    key={`${day.dayOfWeek}-${idx}`}
                    className="grid grid-cols-[1fr_1fr_auto] gap-2"
                  >
                    <Input
                      aria-label="Inicio"
                      type="time"
                      value={interval.startTime}
                      onChange={(e) =>
                        updateDay(day.dayOfWeek, (d) => ({
                          ...d,
                          intervals: d.intervals.map((it, i) =>
                            i === idx ? { ...it, startTime: e.target.value } : it,
                          ),
                        }))
                      }
                    />
                    <Input
                      aria-label="Fin"
                      type="time"
                      value={interval.endTime}
                      onChange={(e) =>
                        updateDay(day.dayOfWeek, (d) => ({
                          ...d,
                          intervals: d.intervals.map((it, i) =>
                            i === idx ? { ...it, endTime: e.target.value } : it,
                          ),
                        }))
                      }
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        updateDay(day.dayOfWeek, (d) => ({
                          ...d,
                          intervals: d.intervals.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!day.isOpen || day.intervals.length >= 6}
                  onClick={() =>
                    updateDay(day.dayOfWeek, (d) => ({
                      ...d,
                      intervals: [...d.intervals, { startTime: '09:00', endTime: '17:00' }],
                    }))
                  }
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar horario
                </Button>
              </div>
            ))}
          </section>

          <section className="rounded-xl border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Excepciones</h3>
                <p className="text-sm text-muted-foreground">
                  Las excepciones prevalecen sobre el horario habitual y sus periodos son
                  inclusivos.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setForm((p) => ({
                    ...p,
                    scheduleExceptions: [
                      ...p.scheduleExceptions,
                      {
                        type: 'FULLY_CLOSED',
                        recurrenceType: 'NONE',
                        startDate: '',
                        endDate: '',
                        recurrenceEndsOn: null,
                        weekdays: [],
                        reason: '',
                        intervals: [],
                      },
                    ],
                  }))
                }
              >
                Agregar excepción
              </Button>
            </div>
            {form.scheduleExceptions.map((ex, index) => {
              const recurrenceType = ex.recurrenceType ?? 'NONE';
              const status = getRecurrenceStatus(ex);
              return (
                <div key={index} className="rounded-lg bg-muted/30 p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Badge variant="secondary">{status}</Badge>
                      <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
                        {formatExceptionRecurrence(ex)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          scheduleExceptions: p.scheduleExceptions.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      Eliminar
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`exception-recurrence-${index}`}>Repetición</Label>
                      <select
                        id={`exception-recurrence-${index}`}
                        className="border-input bg-background rounded-md border px-3 py-2 text-sm w-full"
                        value={recurrenceType}
                        onChange={(e) => {
                          const next = e.target.value as DepartmentExceptionRecurrenceType;
                          updateException(index, (item) => ({
                            type: item.type,
                            recurrenceType: next,
                            startDate: next === 'NONE' ? (item.startDate ?? '') : undefined,
                            endDate:
                              next === 'NONE' ? (item.endDate ?? item.startDate ?? '') : undefined,
                            recurrenceStartsOn:
                              next === 'NONE'
                                ? undefined
                                : (item.recurrenceStartsOn ??
                                  new Date().toISOString().slice(0, 10)),
                            recurrenceEndsOn:
                              next === 'NONE' ? null : (item.recurrenceEndsOn ?? null),
                            yearlyStartMonth:
                              next === 'YEARLY' ? (item.yearlyStartMonth ?? 9) : undefined,
                            yearlyStartDay:
                              next === 'YEARLY' ? (item.yearlyStartDay ?? 16) : undefined,
                            yearlyEndMonth:
                              next === 'YEARLY'
                                ? (item.yearlyEndMonth ?? item.yearlyStartMonth ?? 9)
                                : undefined,
                            yearlyEndDay:
                              next === 'YEARLY'
                                ? (item.yearlyEndDay ?? item.yearlyStartDay ?? 16)
                                : undefined,
                            weeklyAnchorDate:
                              next === 'WEEKLY'
                                ? (item.weeklyAnchorDate ?? new Date().toISOString().slice(0, 10))
                                : undefined,
                            weekdays:
                              next === 'WEEKLY' || next === 'SPECIFIC_WEEKDAYS'
                                ? item.weekdays?.length
                                  ? item.weekdays
                                  : ['FRIDAY']
                                : [],
                            reason: item.reason,
                            intervals: item.intervals,
                          }));
                        }}
                      >
                        {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`exception-type-${index}`}>Tipo de excepción</Label>
                      <select
                        id={`exception-type-${index}`}
                        className="border-input bg-background rounded-md border px-3 py-2 text-sm w-full"
                        value={ex.type}
                        onChange={(e) =>
                          updateException(index, (item) => ({
                            ...item,
                            type: e.target.value as DepartmentScheduleExceptionType,
                            intervals: e.target.value === 'FULLY_CLOSED' ? [] : item.intervals,
                          }))
                        }
                      >
                        {Object.entries(EXCEPTION_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {recurrenceType === 'NONE' ? (
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`exception-start-${index}`}>Fecha inicial</Label>
                        <Input
                          id={`exception-start-${index}`}
                          type="date"
                          value={ex.startDate ?? ''}
                          onChange={(e) =>
                            updateException(index, (item) => ({
                              ...item,
                              startDate: e.target.value,
                              endDate: item.endDate || e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`exception-end-${index}`}>Fecha final</Label>
                        <Input
                          id={`exception-end-${index}`}
                          type="date"
                          value={ex.endDate ?? ''}
                          onChange={(e) =>
                            updateException(index, (item) => ({ ...item, endDate: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-md border bg-background/60 p-3">
                      {recurrenceType === 'YEARLY' ? (
                        <>
                          <div className="grid gap-2 md:grid-cols-4">
                            <Label className="space-y-1">
                              Día inicial
                              <Input
                                type="number"
                                min={1}
                                max={31}
                                value={ex.yearlyStartDay ?? 1}
                                onChange={(e) =>
                                  updateException(index, (item) => ({
                                    ...item,
                                    yearlyStartDay: Number(e.target.value),
                                  }))
                                }
                              />
                            </Label>
                            <Label className="space-y-1">
                              Mes inicial
                              <select
                                className="border-input bg-background rounded-md border px-3 py-2 text-sm w-full"
                                value={ex.yearlyStartMonth ?? 1}
                                onChange={(e) =>
                                  updateException(index, (item) => ({
                                    ...item,
                                    yearlyStartMonth: Number(e.target.value),
                                  }))
                                }
                              >
                                {MONTHS.map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </Label>
                            <Label className="space-y-1">
                              Día final
                              <Input
                                type="number"
                                min={1}
                                max={31}
                                value={ex.yearlyEndDay ?? 1}
                                onChange={(e) =>
                                  updateException(index, (item) => ({
                                    ...item,
                                    yearlyEndDay: Number(e.target.value),
                                  }))
                                }
                              />
                            </Label>
                            <Label className="space-y-1">
                              Mes final
                              <select
                                className="border-input bg-background rounded-md border px-3 py-2 text-sm w-full"
                                value={ex.yearlyEndMonth ?? 1}
                                onChange={(e) =>
                                  updateException(index, (item) => ({
                                    ...item,
                                    yearlyEndMonth: Number(e.target.value),
                                  }))
                                }
                              >
                                {MONTHS.map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </Label>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            El 29 de febrero solo aplica en años bisiestos. Si el mes final queda
                            antes del inicial, el periodo cruza al siguiente año.
                          </p>
                        </>
                      ) : (
                        <fieldset className="space-y-2">
                          <legend className="text-sm font-medium">Días activos</legend>
                          <div className="flex flex-wrap gap-2">
                            {DAYS.map((day) => {
                              const checked = (ex.weekdays ?? []).includes(day.value);
                              return (
                                <label
                                  key={day.value}
                                  className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      updateException(index, (item) => ({
                                        ...item,
                                        weekdays: e.target.checked
                                          ? [...(item.weekdays ?? []), day.value]
                                          : (item.weekdays ?? []).filter(
                                              (value) => value !== day.value,
                                            ),
                                      }))
                                    }
                                  />
                                  {day.label}
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      )}
                      {recurrenceType === 'WEEKLY' ? (
                        <div className="space-y-2">
                          <Label htmlFor={`weekly-anchor-${index}`}>Fecha ancla semanal</Label>
                          <Input
                            id={`weekly-anchor-${index}`}
                            type="date"
                            value={ex.weeklyAnchorDate ?? ''}
                            onChange={(e) =>
                              updateException(index, (item) => ({
                                ...item,
                                weeklyAnchorDate: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ) : null}
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`valid-from-${index}`}>Vigente desde</Label>
                          <Input
                            id={`valid-from-${index}`}
                            type="date"
                            value={ex.recurrenceStartsOn ?? ''}
                            onChange={(e) =>
                              updateException(index, (item) => ({
                                ...item,
                                recurrenceStartsOn: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`valid-to-${index}`}>Vigente hasta (opcional)</Label>
                          <Input
                            id={`valid-to-${index}`}
                            type="date"
                            value={ex.recurrenceEndsOn ?? ''}
                            onChange={(e) =>
                              updateException(index, (item) => ({
                                ...item,
                                recurrenceEndsOn: e.target.value || null,
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <Input
                    placeholder="Motivo opcional"
                    value={ex.reason ?? ''}
                    onChange={(e) =>
                      updateException(index, (item) => ({ ...item, reason: e.target.value }))
                    }
                  />
                  {ex.type === 'FULLY_CLOSED' ? (
                    <p className="text-sm text-muted-foreground">
                      El departamento permanecerá cerrado durante toda la fecha, periodo o
                      recurrencia configurada.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        {ex.type === 'PARTIALLY_OPEN'
                          ? 'Horarios en los que estará abierto'
                          : 'Horarios en los que estará cerrado'}
                      </p>
                      {ex.intervals.map((interval, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <Input
                            aria-label="Inicio del intervalo de excepción"
                            type="time"
                            value={interval.startTime}
                            onChange={(e) =>
                              updateException(index, (item) => ({
                                ...item,
                                intervals: item.intervals.map((it, i) =>
                                  i === idx ? { ...it, startTime: e.target.value } : it,
                                ),
                              }))
                            }
                          />
                          <Input
                            aria-label="Fin del intervalo de excepción"
                            type="time"
                            value={interval.endTime}
                            onChange={(e) =>
                              updateException(index, (item) => ({
                                ...item,
                                intervals: item.intervals.map((it, i) =>
                                  i === idx ? { ...it, endTime: e.target.value } : it,
                                ),
                              }))
                            }
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Eliminar intervalo"
                            onClick={() =>
                              updateException(index, (item) => ({
                                ...item,
                                intervals: item.intervals.filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateException(index, (item) => ({
                            ...item,
                            intervals: [
                              ...item.intervals,
                              { startTime: '09:00', endTime: '12:00' },
                            ],
                          }))
                        }
                      >
                        Agregar intervalo
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando...' : isEdit ? 'Actualizar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
