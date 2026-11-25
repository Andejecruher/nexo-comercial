'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { citizensApi, type Citizen } from '@/lib/shared/citizens-api';
import {
  mapConversationToInboxUi,
  messagingApi,
  type ConversationListItemApi,
  type InboxConversation,
} from '@/lib/shared/messaging-api';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CampaignTemplatePicker } from '@/components/shared/CampaignTemplatePicker';
import { VariableMapping } from '@/components/shared/CsvAudienceMapping';
import {
  campaignVariables,
  campaignMediaType,
  renderMappedText,
  type Mapping,
} from '@/lib/shared/campaigns-api';
import { templatesApi, type MessageTemplate, type TemplateLine } from '@/lib/shared/templates-api';
import { WhatsAppMobilePreview } from '@/components/shared/messaging/whatsapp-mobile-preview';
import { apiClient } from '@/lib/shared/api-client';

interface StartConversationDialogProps {
  initialChat?: InboxConversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (chat: InboxConversation) => void;
}

function citizenLabel(citizen: Citizen) {
  const name = [citizen.name, citizen.lastName].filter(Boolean).join(' ').trim();
  return name || citizen.phone || 'Sin nombre';
}

function phoneCandidate(raw: string): string | undefined {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return undefined;
  return trimmed;
}

export function StartConversationDialog({
  open,
  onOpenChange,
  onSelect,
  initialChat,
}: StartConversationDialogProps) {
  const initialChatRef = useRef(initialChat);
  useEffect(() => {
    initialChatRef.current = initialChat;
  }, [initialChat]);
  const [selected, setSelected] = useState<InboxConversation>();
  const [lines, setLines] = useState<TemplateLine[]>([]);
  const [lineId, setLineId] = useState('');
  const [template, setTemplate] = useState<MessageTemplate>();
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [file, setFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState('');
  const submission = useRef<{ signature: string; key: string; attachmentId?: string } | undefined>(
    undefined,
  );
  const sending = useRef(false);
  useEffect(() => {
    if (!open) return;
    setSelected(initialChatRef.current);
    setLineId(initialChatRef.current?.communicationLineId ?? '');
    setTemplate(undefined);
    setMappings({});
    setFile(undefined);
    setSendError('');
    let active = true;
    templatesApi
      .lines()
      .then((rows) => {
        if (active) setLines(rows);
      })
      .catch((error: Error) => {
        if (active) setSendError(error.message);
      });
    return () => {
      active = false;
    };
  }, [open, initialChat?.id]);
  useEffect(() => {
    if (!file) {
      setPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const variables = campaignVariables(template);
  const mediaType = campaignMediaType(template);
  const values = Object.fromEntries(
    variables.map((v) => [
      v.key,
      mappings[v.key]?.mode === 'static'
        ? (mappings[v.key] as { mode: 'static'; value: string }).value.trim()
        : '',
    ]),
  );
  const headerComponent = template?.components.find((component) => component.type === 'HEADER');
  const bodyComponent = template?.components.find((component) => component.type === 'BODY');
  const footerComponent = template?.components.find((component) => component.type === 'FOOTER');
  const previewHeader = headerComponent?.text
    ? renderMappedText(headerComponent.text, 'HEADER', mappings, {})
    : undefined;
  const previewBody = renderMappedText(bodyComponent?.text, 'BODY', mappings, {});
  const previewFooter = footerComponent?.text ?? '';
  const previewButtons = template?.components.flatMap((component) => component.buttons ?? []) ?? [];
  const previewMedia = mediaType
    ? { kind: mediaType, url: previewUrl, name: file?.name }
    : undefined;
  const submitTemplate = async () => {
    if (sending.current || !selected || !template || !lineId) return;
    if (
      Object.values(values).some((value) => !value || /[\r\n\t]/.test(value) || /\{\{/.test(value))
    ) {
      setSendError('Completa todas las variables con sus valores definitivos');
      return;
    }
    if (mediaType && !file) {
      setSendError('Carga el archivo del encabezado');
      return;
    }
    const signature = JSON.stringify([
      selected.id,
      lineId,
      template.id,
      values,
      file?.name,
      file?.size,
      file?.lastModified,
    ]);
    if (submission.current?.signature !== signature)
      submission.current = { signature, key: crypto.randomUUID() };
    const attempt = submission.current;
    sending.current = true;
    setSubmitting(true);
    setSendError('');
    try {
      let target = selected;
      if (selected.communicationLineId !== lineId) {
        const ensured = await messagingApi.ensureOpen(selected.citizen.id, lineId);
        if (!ensured.ok) throw new Error(ensured.message);
        target = mapConversationToInboxUi(ensured.data.conversation);
      }
      if (file && !attempt.attachmentId) {
        const form = new FormData();
        form.append('file', file);
        form.append('lineId', lineId);
        form.append('templateId', template.id);
        const upload = await apiClient.post<{ attachmentId: string }>(
          `/conversations/${target.id}/template-media`,
          form,
        );
        if (!upload.ok) throw new Error(upload.message);
        attempt.attachmentId = upload.data.attachmentId;
      }
      const result = await apiClient.post(
        `/conversations/${target.id}/template`,
        { lineId, templateId: template.id, values, attachmentId: attempt.attachmentId },
        { headers: { 'Idempotency-Key': attempt.key } },
      );
      if (!result.ok) throw new Error(result.message);
      toast.success('Plantilla en cola de envío');
      onSelect(target);
      onOpenChange(false);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'No se pudo enviar');
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  };
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Citizen[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    if (!open) {
      setSearch('');
      setResults([]);
      setOpeningId(undefined);
      setCreating(false);
      setNewName('');
      setNewPhone('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const t = window.setTimeout(async () => {
      setLoading(true);
      const result = await citizensApi.list({ search: q, limit: 15 });
      setLoading(false);
      if (result.ok) {
        setResults(result.data.citizens);
        const phone = phoneCandidate(q);
        if (phone) setNewPhone(phone);
      } else {
        setResults([]);
        toast.error('No se pudo buscar ciudadanos', { description: result.message });
      }
    }, 300);

    return () => window.clearTimeout(t);
  }, [open, search]);

  const selectConversation = (row: ConversationListItemApi) => {
    const chat = mapConversationToInboxUi(row);
    setSelected(chat);
    setLineId(chat.communicationLineId ?? '');
  };

  const openCitizenConversation = async (citizen: Citizen) => {
    setOpeningId(citizen.id);
    const listed = await messagingApi.listConversations({ citizenId: citizen.id, limit: 20 });

    if (listed.ok) {
      const newest = [...listed.data.items].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      )[0];
      if (newest) {
        setOpeningId(undefined);
        selectConversation(newest);
        return;
      }
    }

    const ensured = await messagingApi.ensureOpen(citizen.id);
    setOpeningId(undefined);

    if (!ensured.ok) {
      toast.error('No se pudo abrir la conversación', { description: ensured.message });
      return;
    }

    selectConversation(ensured.data.conversation);
  };

  const createAndOpen = async () => {
    const phone = phoneCandidate(newPhone || search);
    if (!phone) {
      toast.error('Ingresa un teléfono válido (al menos 10 dígitos)');
      return;
    }

    setCreating(true);
    const created = await citizensApi.create({
      phone,
      name: newName.trim() || undefined,
      sourceChannel: 'whatsapp',
    });

    if (!created.ok) {
      setCreating(false);
      toast.error('No se pudo crear el ciudadano', { description: created.message });
      return;
    }

    const ensured = await messagingApi.ensureOpen(created.data.citizen.id);
    setCreating(false);

    if (!ensured.ok) {
      toast.error('El ciudadano se creó, pero no se pudo abrir la conversación', {
        description: ensured.message,
      });
      return;
    }

    toast.success('Ciudadano y conversación creados');
    selectConversation(ensured.data.conversation);
  };

  const canCreate = Boolean(phoneCandidate(newPhone || search));
  const showCreateForm = !loading && search.trim().length >= 2 && results.length === 0 && canCreate;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Iniciar conversación</DialogTitle>
          <DialogDescription>
            Busca un ciudadano registrado o crea uno nuevo con su teléfono.
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="space-y-4">
            <p className="font-medium">
              {selected.citizen.name} · {selected.citizen.phone}
            </p>
            {!initialChat && (
              <Button
                variant="outline"
                onClick={() => setSelected(undefined)}
                disabled={submitting}
              >
                Cambiar contacto
              </Button>
            )}
            <label className="block">
              Línea de WhatsApp
              <select
                aria-label="Línea de WhatsApp"
                className="block w-full border rounded p-2"
                value={lineId}
                disabled={submitting}
                onChange={(event) => {
                  setLineId(event.target.value);
                  setTemplate(undefined);
                  setMappings({});
                  setFile(undefined);
                }}
              >
                <option value="">Seleccionar línea</option>
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name} {line.phone}
                  </option>
                ))}
              </select>
            </label>
            <fieldset disabled={submitting} className="space-y-4">
              <CampaignTemplatePicker
                key={lineId}
                lineId={lineId}
                value={template}
                onChange={(value) => {
                  setTemplate(value);
                  setMappings({});
                  setFile(undefined);
                }}
              />
              {template && (
                <>
                  <VariableMapping
                    staticOnly
                    variables={variables}
                    fields={[]}
                    mappings={mappings}
                    onChange={setMappings}
                  />
                  {mediaType && (
                    <label className="block">
                      Archivo de encabezado ({mediaType})
                      <Input
                        type="file"
                        accept={
                          mediaType === 'IMAGE'
                            ? 'image/jpeg,image/png'
                            : mediaType === 'VIDEO'
                              ? 'video/mp4'
                              : 'application/pdf'
                        }
                        onChange={(event) => setFile(event.target.files?.[0])}
                      />
                    </label>
                  )}
                  <div className="overflow-x-auto pb-1" aria-label="Vista previa de plantilla">
                    <WhatsAppMobilePreview
                      className="min-w-92.5"
                      lineName={lines.find((line) => line.id === lineId)?.name ?? ''}
                      header={previewHeader}
                      media={previewMedia}
                      body={previewBody}
                      footer={previewFooter}
                      buttons={previewButtons}
                      caption="Vista previa con los valores configurados."
                    />
                  </div>
                </>
              )}
            </fieldset>
            <Button
              disabled={
                submitting ||
                !template ||
                !lineId ||
                Object.values(values).some((value) => !value) ||
                Boolean(mediaType && !file)
              }
              onClick={() => void submitTemplate()}
            >
              {submitting ? 'Preparando envío…' : 'Confirmar y enviar plantilla'}
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9 text-sm"
                placeholder="Nombre o teléfono..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Buscando…
                </div>
              )}
              {!loading && search.trim().length < 2 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Escribe al menos 2 caracteres para buscar.
                </p>
              )}
              {!loading && search.trim().length >= 2 && results.length === 0 && !canCreate && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Sin coincidencias
                </p>
              )}
              {showCreateForm && (
                <div className="space-y-3 p-4">
                  <div className="flex items-start gap-2 text-sm text-foreground">
                    <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>
                      No hay un ciudadano con ese número. Completa el registro para iniciar la
                      conversación.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-citizen-phone" className="text-xs">
                      Teléfono
                    </Label>
                    <Input
                      id="new-citizen-phone"
                      className="h-9 text-sm"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="5219612345678"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-citizen-name" className="text-xs">
                      Nombre (opcional)
                    </Label>
                    <Input
                      id="new-citizen-name"
                      className="h-9 text-sm"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nombre del ciudadano"
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={creating || !phoneCandidate(newPhone)}
                    onClick={() => void createAndOpen()}
                  >
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creando…
                      </>
                    ) : (
                      'Crear e iniciar conversación'
                    )}
                  </Button>
                </div>
              )}
              {!loading &&
                results.map((citizen) => {
                  const busy = openingId === citizen.id;
                  return (
                    <button
                      key={citizen.id}
                      type="button"
                      disabled={Boolean(openingId)}
                      onClick={() => void openCitizenConversation(citizen)}
                      className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/50 disabled:opacity-60"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                        {citizenLabel(citizen).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {citizenLabel(citizen)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {citizen.phone || 'Sin teléfono'}
                        </p>
                      </div>
                      {busy && (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
            </div>
          </>
        )}
        {sendError && (
          <p role="alert" className="text-destructive">
            {sendError}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
