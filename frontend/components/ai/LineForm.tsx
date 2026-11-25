'use client';

import { LineFormDialog } from '@/components/ai/LineFormDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useDepartments } from '@/hooks/shared/useDepartments';
import type {
  AiAgent,
  CommunicationLine,
  CreateLinePayload,
  UpdateLinePayload,
} from '@/lib/shared/ai-api';
import { Phone, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

type ActionResult = { success: boolean; error?: string };

interface LineFormProps {
  open: boolean;
  availableAgents: AiAgent[];
  /** Only used on create: preselects and locks the agent (AgentTabs). */
  preselectedAgentId?: string;
  /** When present the form edits this line; otherwise it creates a new one. */
  line?: CommunicationLine;
  onClose: () => void;
  onCreate: (payload: CreateLinePayload) => Promise<ActionResult>;
  onUpdate: (id: string, payload: UpdateLinePayload) => Promise<ActionResult>;
}

type FormState = {
  displayName: string;
  phoneNumber: string;
  channel: string;
  provider: string;
  whatsappPhoneNumberId: string;
  whatsappBusinessAccountId: string;
  whatsappAppId: string;
  whatsappAppSecret: string;
  whatsappAccessToken: string;
  isActive: boolean;
  isDefault: boolean;
  aiEnabled: boolean;
  agentId: string;
  departmentIds: string[];
};

const INITIAL_FORM: FormState = {
  displayName: '',
  phoneNumber: '',
  channel: 'whatsapp',
  provider: 'meta',
  whatsappPhoneNumberId: '',
  whatsappBusinessAccountId: '',
  whatsappAppId: '',
  whatsappAppSecret: '',
  whatsappAccessToken: '',
  isActive: true,
  isDefault: false,
  aiEnabled: false,
  agentId: '',
  departmentIds: [],
};

function optionalTrim(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

function getMetadataStringArray(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function createFormState(preselectedAgentId?: string): FormState {
  return {
    ...INITIAL_FORM,
    agentId: preselectedAgentId ?? '',
    aiEnabled: Boolean(preselectedAgentId),
  };
}

function editFormState(line: CommunicationLine): FormState {
  const metadata = line.metadata ?? {};
  return {
    displayName: line.displayName,
    phoneNumber: line.phoneNumber ?? '',
    channel: line.channel || 'whatsapp',
    provider: line.provider ?? 'meta',
    // externalIdentifier is the canonical Meta Phone Number ID for existing lines.
    whatsappPhoneNumberId: line.externalIdentifier || line.whatsappPhoneNumberId || '',
    whatsappBusinessAccountId:
      line.whatsappBusinessAccountId ?? getMetadataString(metadata, 'businessAccountId'),
    whatsappAppId: line.whatsappAppId ?? '',
    // Secrets are never prefilled: empty means "keep the stored value".
    whatsappAppSecret: '',
    whatsappAccessToken: '',
    isActive: line.isActive,
    isDefault: line.isDefault,
    aiEnabled: line.aiEnabled,
    agentId: line.agentId ?? '',
    departmentIds:
      line.departments && line.departments.length > 0
        ? line.departments.map((d) => d.id)
        : getMetadataStringArray(metadata, 'departmentIds'),
  };
}

function toCreatePayload(form: FormState): CreateLinePayload {
  const provider = form.provider === 'twilio' ? 'twilio' : 'meta';
  return {
    displayName: form.displayName.trim(),
    ...(optionalTrim(form.phoneNumber) && { phoneNumber: form.phoneNumber.trim() }),
    channel: form.channel || 'whatsapp',
    provider,
    ...(optionalTrim(form.whatsappPhoneNumberId) && {
      whatsappPhoneNumberId: form.whatsappPhoneNumberId.trim(),
    }),
    ...(optionalTrim(form.whatsappBusinessAccountId) && {
      whatsappBusinessAccountId: form.whatsappBusinessAccountId.trim(),
    }),
    ...(optionalTrim(form.whatsappAppId) && { whatsappAppId: form.whatsappAppId.trim() }),
    ...(optionalTrim(form.whatsappAppSecret) && {
      whatsappAppSecret: form.whatsappAppSecret.trim(),
    }),
    ...(optionalTrim(form.whatsappAccessToken) && {
      whatsappAccessToken: form.whatsappAccessToken.trim(),
    }),
    isActive: form.isActive,
    isDefault: form.isDefault,
    aiEnabled: form.aiEnabled,
    ...(form.agentId && { agentId: form.agentId }),
    ...(form.departmentIds.length > 0 && { departmentIds: form.departmentIds }),
  };
}

function toUpdatePayload(form: FormState): UpdateLinePayload {
  const phoneNumberId = optionalTrim(form.whatsappPhoneNumberId);
  return {
    displayName: form.displayName.trim(),
    ...(optionalTrim(form.phoneNumber) && { phoneNumber: form.phoneNumber.trim() }),
    ...(form.provider && { provider: form.provider }),
    // Keep externalIdentifier and whatsappPhoneNumberId in sync for existing lines.
    ...(phoneNumberId && {
      externalIdentifier: phoneNumberId,
      whatsappPhoneNumberId: phoneNumberId,
    }),
    ...(optionalTrim(form.whatsappBusinessAccountId) && {
      whatsappBusinessAccountId: form.whatsappBusinessAccountId.trim(),
    }),
    ...(optionalTrim(form.whatsappAppId) && { whatsappAppId: form.whatsappAppId.trim() }),
    ...(optionalTrim(form.whatsappAppSecret) && {
      whatsappAppSecret: form.whatsappAppSecret.trim(),
    }),
    ...(optionalTrim(form.whatsappAccessToken) && {
      whatsappAccessToken: form.whatsappAccessToken.trim(),
    }),
    isActive: form.isActive,
    isDefault: form.isDefault,
    aiEnabled: form.aiEnabled,
    agentId: form.aiEnabled ? form.agentId : null,
    departmentIds: form.departmentIds,
  };
}

export function LineForm({
  open,
  availableAgents,
  preselectedAgentId,
  line,
  onClose,
  onCreate,
  onUpdate,
}: LineFormProps) {
  const isEdit = Boolean(line);
  const [form, setForm] = useState<FormState>(
    line ? editFormState(line) : createFormState(preselectedAgentId),
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const { departments } = useDepartments({ pageSize: 50 });

  useEffect(() => {
    if (!open) return;
    setForm(line ? editFormState(line) : createFormState(preselectedAgentId));
    setErrors({});
  }, [open, line, preselectedAgentId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.displayName.trim()) next.displayName = 'El nombre es requerido';
    if (!form.whatsappPhoneNumberId.trim())
      next.whatsappPhoneNumberId = 'El Meta Phone ID es requerido';
    // On edit the stored credentials are kept when the fields stay empty.
    const requiresMetaCredentials =
      !isEdit && (form.channel === 'whatsapp' || form.provider === 'meta');
    if (requiresMetaCredentials) {
      if (!form.whatsappAppId.trim()) next.whatsappAppId = 'El App ID es requerido';
      if (!form.whatsappAppSecret.trim()) next.whatsappAppSecret = 'El App Secret es requerido';
      if (!form.whatsappAccessToken.trim())
        next.whatsappAccessToken = 'El Access Token es requerido';
    }
    if (form.aiEnabled && !form.agentId) {
      next.agentId = 'Seleccioná un agente para habilitar IA';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!line) {
      setSubmitting(true);
      const result = await onCreate(toCreatePayload(form));
      setSubmitting(false);
      if (result.success) onClose();
      return;
    }
    setSubmitting(true);
    const result = await onUpdate(line.id, toUpdatePayload(form));
    setSubmitting(false);
    if (result.success) onClose();
  };

  // Keep the currently assigned agent selectable even if it is inactive or
  // missing from the filtered agent list.
  const agentOptions = line?.agent ? [...availableAgents, line.agent] : availableAgents;
  const activeAgents = agentOptions
    .filter((a, index, all) => all.findIndex((x) => x.id === a.id) === index)
    .filter((a) => a.isActive || a.id === form.agentId);
  const agentFixed = !isEdit && Boolean(preselectedAgentId);

  const toggleDepartment = (id: string) => {
    set(
      'departmentIds',
      form.departmentIds.includes(id)
        ? form.departmentIds.filter((x) => x !== id)
        : [...form.departmentIds, id],
    );
  };

  const submitLabel = isEdit ? 'Guardar cambios' : 'Crear línea';
  const submittingLabel = isEdit ? 'Guardando…' : 'Creando…';

  return (
    <LineFormDialog
      open={open}
      onClose={onClose}
      title={
        <>
          <Phone className="w-4 h-4" />
          {isEdit ? 'Configurar línea' : 'Nueva línea de comunicación'}
        </>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? submittingLabel : submitLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="line-displayName">
            Nombre <span className="text-destructive">*</span>
          </Label>
          <Input
            id="line-displayName"
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
            placeholder="Mi línea WhatsApp"
            className="h-9"
          />
          {errors.displayName && <p className="text-xs text-destructive">{errors.displayName}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="line-phoneNumber">Número de teléfono</Label>
          <Input
            id="line-phoneNumber"
            value={form.phoneNumber}
            onChange={(e) => set('phoneNumber', e.target.value)}
            placeholder="+54 9 11 0000 0000"
            className="h-9"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="line-provider">Proveedor</Label>
          <Select value={form.provider} onValueChange={(v) => set('provider', v)}>
            <SelectTrigger id="line-provider">
              <SelectValue placeholder="Seleccioná un proveedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="meta">Meta</SelectItem>
              <SelectItem value="twilio">Twilio</SelectItem>
            </SelectContent>
          </Select>
          {errors.provider && <p className="text-xs text-destructive">{errors.provider}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="line-whatsappPhoneNumberId">
            Phone Number ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="line-whatsappPhoneNumberId"
            value={form.whatsappPhoneNumberId}
            onChange={(e) => set('whatsappPhoneNumberId', e.target.value)}
            placeholder="1234567890"
            className="h-9 font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Identificador del número en la API de Meta (externalIdentifier)
          </p>
          {errors.whatsappPhoneNumberId && (
            <p className="text-xs text-destructive">{errors.whatsappPhoneNumberId}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="line-whatsappBusinessAccountId">Business Account ID</Label>
          <Input
            id="line-whatsappBusinessAccountId"
            value={form.whatsappBusinessAccountId}
            onChange={(e) => set('whatsappBusinessAccountId', e.target.value)}
            placeholder="Business Account ID de WhatsApp"
            className="h-9 font-mono"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="line-whatsappAppId">APP ID</Label>
          <Input
            id="line-whatsappAppId"
            value={form.whatsappAppId}
            onChange={(e) => set('whatsappAppId', e.target.value)}
            placeholder="APP ID de WhatsApp"
            className="h-9 font-mono"
          />
          {errors.whatsappAppId && (
            <p className="text-xs text-destructive">{errors.whatsappAppId}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="line-whatsappAppSecret">APP SECRET</Label>
          <Input
            id="line-whatsappAppSecret"
            value={form.whatsappAppSecret}
            onChange={(e) => set('whatsappAppSecret', e.target.value)}
            placeholder={isEdit ? 'Dejar vacío para conservar el actual' : 'APP SECRET de WhatsApp'}
            className="h-9 font-mono"
            type="password"
            autoComplete="new-password"
          />
          {errors.whatsappAppSecret && (
            <p className="text-xs text-destructive">{errors.whatsappAppSecret}</p>
          )}
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="line-whatsappAccessToken">ACCESS TOKEN</Label>
          <Input
            id="line-whatsappAccessToken"
            value={form.whatsappAccessToken}
            onChange={(e) => set('whatsappAccessToken', e.target.value)}
            placeholder={
              isEdit ? 'Dejar vacío para conservar el actual' : 'ACCESS TOKEN de WhatsApp'
            }
            className="h-9 font-mono"
            type="password"
            autoComplete="new-password"
          />
          {errors.whatsappAccessToken && (
            <p className="text-xs text-destructive">{errors.whatsappAccessToken}</p>
          )}
        </div>

        {isEdit && (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Las credenciales se guardan cifradas. Dejá los campos vacíos para conservar las
            actuales.
          </p>
        )}

        <hr className="border-border sm:col-span-2" />

        <div className="flex items-center justify-between sm:col-span-2">
          <div>
            <Label className="text-sm font-medium">Línea activa</Label>
            <p className="text-xs text-muted-foreground">
              Las líneas inactivas no reciben mensajes
            </p>
          </div>
          <Switch
            checked={form.isActive}
            onCheckedChange={(v) => set('isActive', v)}
            aria-label="Activar línea"
          />
        </div>

        <div className="flex items-center justify-between sm:col-span-2">
          <div>
            <Label className="text-sm font-medium">Línea por defecto</Label>
            <p className="text-xs text-muted-foreground">
              Usada cuando no hay línea específica asignada
            </p>
          </div>
          <Switch
            checked={form.isDefault}
            onCheckedChange={(v) => set('isDefault', v)}
            aria-label="Marcar como línea por defecto"
          />
        </div>

        <div className="flex items-center justify-between sm:col-span-2">
          <div>
            <Label className="text-sm font-medium flex items-center gap-1.5">
              {form.aiEnabled ? (
                <Wifi className="w-3.5 h-3.5 text-primary" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              IA habilitada
            </Label>
            <p className="text-xs text-muted-foreground">Activa procesamiento automático por IA</p>
          </div>
          <Switch
            checked={form.aiEnabled}
            onCheckedChange={(v) => {
              set('aiEnabled', v);
              if (!v && !agentFixed) set('agentId', '');
            }}
            aria-label="Habilitar IA"
            disabled={agentFixed}
          />
        </div>

        {form.aiEnabled && (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="line-agentId">
              Agente asignado <span className="text-destructive">*</span>
            </Label>
            <select
              id="line-agentId"
              value={form.agentId}
              onChange={(e) => set('agentId', e.target.value)}
              disabled={agentFixed}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="">Seleccioná un agente…</option>
              {activeAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.provider} / {a.model})
                </option>
              ))}
            </select>
            {errors.agentId && <p className="text-xs text-destructive">{errors.agentId}</p>}
            {activeAgents.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No hay agentes activos. Activá uno primero.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Departamentos asociados</Label>
          {departments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No hay departamentos disponibles</p>
          ) : (
            <div className="max-h-36 overflow-y-auto rounded-md border border-border p-2">
              <div className="grid gap-1.5">
                {departments.map((dept) => {
                  const checked = form.departmentIds.includes(dept.id);
                  return (
                    <label key={dept.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDepartment(dept.id)}
                        className="rounded border-input"
                      />
                      <span>{dept.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {form.departmentIds.length} departamento(s) seleccionado(s)
          </p>
        </div>
      </div>
    </LineFormDialog>
  );
}
