'use client';

import {
  BarrioSelectCombobox,
  formatBarrioLabel,
} from '@/components/admin/electoral-catalog/BarrioSelectCombobox';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
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
import { Textarea } from '@/components/ui/textarea';
import { withDefaultTime } from '@/lib/date-time-picker';
import type {
  CreateEventPayload,
  EventRecord,
  EventStatus,
  EventType,
  EventVisibility,
} from '@/lib/events-api';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Controller, type DefaultValues, type Resolver, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'townhall', label: 'Asamblea' },
  { value: 'community', label: 'Comunitario' },
  { value: 'volunteer', label: 'Voluntariado' },
  { value: 'campaign', label: 'Brigada social' },
  { value: 'rally', label: 'Encuentro comunitario' },
];

const EVENT_STATUSES: { value: EventStatus; label: string }[] = [
  { value: 'draft', label: 'Borrador' },
  { value: 'published', label: 'Publicado' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
];

const EVENT_VISIBILITIES: { value: EventVisibility; label: string }[] = [
  { value: 'public', label: 'Público' },
  { value: 'private', label: 'Privado (solo uso interno)' },
];

export const createEventFormSchema = z
  .object({
    title: z.string().trim().min(2, 'El título debe tener al menos 2 caracteres.').max(255),
    eventType: z.enum(['townhall', 'community', 'volunteer', 'campaign', 'rally']),
    status: z.enum(['draft', 'published', 'completed', 'cancelled']),
    visibility: z.enum(['public', 'private']),
    startsAt: z.date({ required_error: 'La fecha de inicio es obligatoria.' }),
    endsAt: z.date().optional(),
    capacity: z.string(),
    locationName: z.string(),
    neighborhoodId: z.string(),
    neighborhood: z.string(),
    address: z.string(),
    description: z.string(),
  })
  .refine((data) => data.endsAt === undefined || data.endsAt.getTime() > data.startsAt.getTime(), {
    message: 'La fecha de fin debe ser posterior a la de inicio.',
    path: ['endsAt'],
  })
  .superRefine((data, ctx) => {
    const trimmed = data.capacity.trim();
    if (!trimmed) return;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El cupo debe ser un entero positivo.',
        path: ['capacity'],
      });
    }
  });

export type CreateEventFormValues = z.infer<typeof createEventFormSchema>;

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toPayload(values: CreateEventFormValues): CreateEventPayload {
  const capNum = values.capacity.trim() ? Number.parseInt(values.capacity, 10) : undefined;
  return {
    title: values.title.trim(),
    eventType: values.eventType,
    status: values.status,
    visibility: values.visibility,
    startsAt: values.startsAt.toISOString(),
    ...(values.endsAt ? { endsAt: values.endsAt.toISOString() } : {}),
    ...(optional(values.locationName) ? { locationName: optional(values.locationName) } : {}),
    ...(optional(values.neighborhood) ? { neighborhood: optional(values.neighborhood) } : {}),
    ...(optional(values.address) ? { address: optional(values.address) } : {}),
    ...(optional(values.description) ? { description: optional(values.description) } : {}),
    ...(capNum !== undefined && !Number.isNaN(capNum) ? { capacity: capNum } : {}),
  };
}

function emptyFormValues(initialDate?: Date): DefaultValues<CreateEventFormValues> {
  return {
    title: '',
    eventType: 'townhall',
    status: 'draft',
    visibility: 'public',
    startsAt: initialDate ? withDefaultTime(initialDate) : undefined,
    endsAt: undefined,
    capacity: '',
    locationName: '',
    neighborhoodId: '',
    neighborhood: '',
    address: '',
    description: '',
  };
}

function eventToFormValues(event: EventRecord): CreateEventFormValues {
  return {
    title: event.title,
    eventType: event.eventType,
    status: event.status,
    visibility: event.visibility ?? 'public',
    startsAt: new Date(event.startsAt),
    endsAt: event.endsAt ? new Date(event.endsAt) : undefined,
    capacity: event.capacity !== undefined ? String(event.capacity) : '',
    locationName: event.locationName ?? '',
    neighborhoodId: '',
    neighborhood: event.neighborhood ?? '',
    address: event.address ?? '',
    description: event.description ?? '',
  };
}

export type CreateEventModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: Date;
  eventData?: EventRecord;
  onSubmit: (payload: CreateEventPayload) => Promise<{ ok: boolean }>;
};

export function CreateEventModal({
  open,
  onOpenChange,
  initialDate,
  eventData,
  onSubmit,
}: CreateEventModalProps) {
  const isEdit = Boolean(eventData);
  const contentRef = useRef<HTMLDivElement>(null);
  const { reset, control, register, handleSubmit, formState, setValue } =
    useForm<CreateEventFormValues>({
      resolver: zodResolver(
        createEventFormSchema as unknown as Parameters<typeof zodResolver>[0],
      ) as Resolver<CreateEventFormValues>,
      defaultValues: eventData ? eventToFormValues(eventData) : emptyFormValues(initialDate),
    });

  const neighborhoodLabel = useWatch({ control, name: 'neighborhood' });
  const visibilityValue = useWatch({ control, name: 'visibility' });

  useEffect(() => {
    if (!open) return;
    reset(eventData ? eventToFormValues(eventData) : emptyFormValues(initialDate));
  }, [eventData, initialDate, open, reset]);

  const busy = formState.isSubmitting;
  const popoverContainer = contentRef.current;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden sm:max-w-3xl">
        <div ref={contentRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar jornada' : 'Nueva jornada de atención'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Actualizá los datos del encuentro. El slug y el organizador no se modifican.'
                : 'Programá el encuentro desde el calendario. El slug y el organizador se asignan en el servidor.'}
            </DialogDescription>
          </DialogHeader>

          <form
            className="min-h-0 flex-1 overflow-y-auto pr-1"
            onSubmit={handleSubmit(async (values) => {
              const result = await onSubmit(toPayload(values));
              if (result.ok) onOpenChange(false);
            })}
          >
            <fieldset disabled={busy} className="space-y-5">
              <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  General
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="create-event-title">Título</Label>
                    <Input
                      id="create-event-title"
                      autoFocus
                      {...register('title')}
                      aria-invalid={Boolean(formState.errors.title) || undefined}
                    />
                    {formState.errors.title ? (
                      <p className="text-destructive text-sm">{formState.errors.title.message}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Controller
                      control={control}
                      name="eventType"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EVENT_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Controller
                      control={control}
                      name="status"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EVENT_STATUSES.map((status) => (
                              <SelectItem key={status.value} value={status.value}>
                                {status.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de evento</Label>
                    <Controller
                      control={control}
                      name="visibility"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EVENT_VISIBILITIES.map((visibility) => (
                              <SelectItem key={visibility.value} value={visibility.value}>
                                {visibility.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {visibilityValue === 'private' ? (
                      <p className="text-xs text-muted-foreground">
                        Los eventos privados nunca se publican en la web pública ni se devuelven en
                        las consultas del agente de IA. La asistencia y las invitaciones se
                        gestionan igual que en un evento público.
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Programación
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="create-event-start">Inicio</Label>
                    <Controller
                      control={control}
                      name="startsAt"
                      render={({ field }) => (
                        <DateTimePicker
                          id="create-event-start"
                          mode="datetime"
                          value={field.value}
                          onChange={field.onChange}
                          invalid={Boolean(formState.errors.startsAt)}
                          popoverContainer={popoverContainer}
                        />
                      )}
                    />
                    {formState.errors.startsAt ? (
                      <p className="text-destructive text-sm">
                        {formState.errors.startsAt.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-event-end">Fin</Label>
                    <Controller
                      control={control}
                      name="endsAt"
                      render={({ field }) => (
                        <DateTimePicker
                          id="create-event-end"
                          mode="datetime"
                          value={field.value}
                          onChange={field.onChange}
                          invalid={Boolean(formState.errors.endsAt)}
                          popoverContainer={popoverContainer}
                        />
                      )}
                    />
                    {formState.errors.endsAt ? (
                      <p className="text-destructive text-sm">{formState.errors.endsAt.message}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-event-capacity">Cupo máximo</Label>
                    <Input
                      id="create-event-capacity"
                      type="number"
                      min={1}
                      placeholder="Sin límite si vacío"
                      {...register('capacity')}
                    />
                    {formState.errors.capacity ? (
                      <p className="text-destructive text-sm">
                        {formState.errors.capacity.message}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Ubicación
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="create-event-location">Nombre del lugar</Label>
                    <Input id="create-event-location" {...register('locationName')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-event-neighborhood">Barrio / Colonia</Label>
                    <Controller
                      control={control}
                      name="neighborhoodId"
                      render={({ field }) => (
                        <BarrioSelectCombobox
                          id="create-event-neighborhood"
                          value={field.value || null}
                          selectedLabel={neighborhoodLabel || null}
                          requireSection={false}
                          allowNone
                          placeholder="Buscar barrio o colonia..."
                          noneLabel="Sin barrio / colonia"
                          isDisabled={busy}
                          triggerClassName="h-9 rounded-md"
                          onChange={(option) => {
                            field.onChange(option?.id ?? '');
                            setValue(
                              'neighborhood',
                              option ? formatBarrioLabel(option.name, option.municipality) : '',
                              { shouldDirty: true },
                            );
                          }}
                        />
                      )}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="create-event-address">Dirección completa</Label>
                    <Input id="create-event-address" {...register('address')} />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Descripción
                </h3>
                <Textarea id="create-event-description" rows={4} {...register('description')} />
              </section>
            </fieldset>

            <DialogFooter className="mt-5 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {isEdit ? 'Guardar cambios' : 'Crear evento'}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
