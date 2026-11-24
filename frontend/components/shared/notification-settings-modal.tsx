'use client';

import { ConversationFilter } from '@/components/shared/conversation-filter';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useAiAgents } from '@/hooks/shared/useAiAgents';
import { useNotificationSettings } from '@/hooks/shared/useNotificationSettings';
import { MOCK_TOAST_EVENTS } from '@/lib/shared/notifications/mock-toast-events';
import { useRouter } from 'next/navigation';
import type { NotificationEventKey } from '@/store/shared/use-notification-preferences-store';
import {
  BellRing,
  Building2,
  CheckCircle2,
  Info,
  LockKeyhole,
  MonitorUp,
  Play,
  TriangleAlert,
  Volume2,
} from 'lucide-react';

interface NotificationSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EVENT_ROWS: Array<{ key: NotificationEventKey; label: string }> = [
  { key: 'newMessage', label: 'Mensaje nuevo' },
  { key: 'departmentTransfer', label: 'Transferencia de departamento' },
  { key: 'ticketClosed', label: 'Cierre de ticket' },
];

export function NotificationSettingsModal({ open, onOpenChange }: NotificationSettingsModalProps) {
  const {
    enabled,
    soundEnabled,
    toastEnabled,
    events,
    scope,
    permissionStatus,
    isRequestingPermission,
    requestBrowserPermission,
    isSaving,
    saveError,
    save,
    reset,
    setEnabled,
    setSoundEnabled,
    setToastEnabled,
    setEventChannel,
    setDepartmentIds,
    setAgentIds,
    previewSound,
  } = useNotificationSettings();
  const aiAgents = useAiAgents();
  const router = useRouter();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    const ok = await save();
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden rounded-3xl border-border p-0 shadow-2xl sm:max-w-2xl">
        <DialogHeader className="border-b border-border bg-muted/30 px-6 py-5 pr-14">
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BellRing className="h-5 w-5" />
          </div>
          <DialogTitle className="text-xl font-black">Configuración de alertas</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Elegí qué eventos querés escuchar, por qué canal y de qué áreas y agentes de IA.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
          {/* Master switch */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BellRing className="h-4 w-4" />
                </div>
                <div>
                  <label
                    htmlFor="notifications-master"
                    className="text-sm font-bold text-foreground"
                  >
                    Activar notificaciones
                  </label>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Apagado aquí silencia todos los sonidos y alertas visuales.
                  </p>
                </div>
              </div>
              <Switch
                id="notifications-master"
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label="Activar notificaciones"
                className="mt-1 h-6 w-11 **:data-[slot=switch-thumb]:size-5"
              />
            </div>
          </section>

          {/* Global channels */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                    <Volume2 className="h-4 w-4" />
                  </div>
                  <div>
                    <label htmlFor="sound-alerts" className="text-sm font-bold text-foreground">
                      Alertas sonoras
                    </label>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Reproduce un tono cuando llegue un evento habilitado.
                    </p>
                  </div>
                </div>
                <Switch
                  id="sound-alerts"
                  checked={soundEnabled}
                  disabled={!enabled}
                  onCheckedChange={setSoundEnabled}
                  aria-label="Activar alertas sonoras"
                  className="mt-1 h-6 w-11 **:data-[slot=switch-thumb]:size-5"
                />
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                      <MonitorUp className="h-4 w-4" />
                    </div>
                    <div>
                      <label htmlFor="toast-alerts" className="text-sm font-bold text-foreground">
                        Notificaciones visuales
                      </label>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Muestra toasts en la página y, si el navegador lo permite, notificaciones de
                        escritorio cuando la pestaña no esté visible.
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="toast-alerts"
                    checked={toastEnabled}
                    disabled={!enabled}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        void requestBrowserPermission().then(() => setToastEnabled(true));
                      } else {
                        setToastEnabled(false);
                      }
                    }}
                    aria-label="Activar notificaciones visuales"
                    className="mt-1 h-6 w-11 **:data-[slot=switch-thumb]:size-5"
                  />
                </div>

                {permissionStatus === 'granted' ? (
                  <p className="mt-3 flex items-center gap-1.5 pl-12 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Permiso concedido por el navegador
                  </p>
                ) : null}

                {permissionStatus === 'denied' ? (
                  <div className="mt-3 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                    <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p>
                      El navegador las tiene bloqueadas. Abrí el candado de la barra de direcciones,
                      cambiá <strong>Notificaciones</strong> a <strong>Permitir</strong> y recargá
                      la página.
                    </p>
                  </div>
                ) : null}

                {permissionStatus === 'unsupported' ? (
                  <p className="mt-3 pl-12 text-xs leading-relaxed text-muted-foreground">
                    Este navegador no admite notificaciones de escritorio.
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {/* Events matrix */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-bold text-foreground">Eventos</h3>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Evento</th>
                    <th className="px-3 py-2 text-center font-semibold">Sonido</th>
                    <th className="px-3 py-2 text-center font-semibold">Toast</th>
                  </tr>
                </thead>
                <tbody>
                  {EVENT_ROWS.map((row) => (
                    <tr key={row.key} className="border-t border-border">
                      <td className="px-3 py-2.5 font-medium text-foreground">{row.label}</td>
                      <td className="px-3 py-2.5 text-center">
                        <Switch
                          id={`${row.key}-sound`}
                          checked={events[row.key].sound}
                          disabled={!enabled || !soundEnabled}
                          onCheckedChange={(checked) => setEventChannel(row.key, 'sound', checked)}
                          aria-label={`Sonido para ${row.label}`}
                          className="h-5 w-9 **:data-[slot=switch-thumb]:size-4"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Switch
                          id={`${row.key}-toast`}
                          checked={events[row.key].toast}
                          disabled={!enabled || !toastEnabled}
                          onCheckedChange={(checked) => setEventChannel(row.key, 'toast', checked)}
                          aria-label={`Toast para ${row.key}`}
                          className="h-5 w-9 **:data-[slot=switch-thumb]:size-4"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Scope */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Alcance por áreas y agentes de IA
                </h3>
                <p className="text-xs text-muted-foreground">
                  Elegí si escuchás todas las líneas o solo las áreas y agentes seleccionados.
                </p>
              </div>
            </div>

            <ConversationFilter
              id="notification-scope-filter"
              ariaLabel="Seleccionar departamentos y agentes de IA"
              departmentIds={scope.departmentIds}
              onDepartmentIdsChange={setDepartmentIds}
              botIds={scope.agentIds}
              onBotIdsChange={setAgentIds}
              aiAgents={aiAgents}
              disabled={!enabled}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Las áreas también limitan la bandeja de conversaciones.
            </p>
          </section>

          {/* Preview */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                <Play className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Probar Notificaciones</h3>
                <p className="text-xs text-muted-foreground">
                  Visualizá cómo se ven los toasts de cada evento en tiempo real.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!enabled || !soundEnabled || isRequestingPermission}
                onClick={() => void previewSound()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/30 px-4 text-sm font-bold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Volume2 className="h-3.5 w-3.5" />
                Probar sonido
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {MOCK_TOAST_EVENTS.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`
                      flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
                      ${
                        event.variant === 'info'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : event.variant === 'warning'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      }
                    `}
                    >
                      {event.variant === 'info' ? (
                        <Info className="h-3.5 w-3.5" />
                      ) : event.variant === 'warning' ? (
                        <TriangleAlert className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {event.label}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {event.mock.contactName
                          ? `${event.mock.contactName} · ${event.mock.departmentSlug}`
                          : `Ticket ${event.mock.ticketId} · ${event.mock.departmentSlug}`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!enabled || !toastEnabled}
                    onClick={() => event.trigger((href) => router.push(href))}
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary/30 px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    Probar
                  </button>
                </div>
              ))}
            </div>
          </section>

          {saveError ? <p className="text-xs font-semibold text-destructive">{saveError}</p> : null}
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
          <DialogClose asChild>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              Cancelar
            </button>
          </DialogClose>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSave()}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Guardando…' : 'Guardar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
