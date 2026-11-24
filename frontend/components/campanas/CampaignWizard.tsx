'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CampaignTemplatePicker } from '@/components/shared/CampaignTemplatePicker';
import { CampaignMediaUpload } from '@/components/campanas/CampaignMediaUpload';
import { CampaignAudiencePicker } from '@/components/campanas/CampaignAudiencePicker';
import { WhatsAppMobilePreview } from '@/components/shared/messaging/whatsapp-mobile-preview';
import { usePermissions } from '@/hooks/shared/usePermissions';
import { citizensApi, type Citizen } from '@/lib/shared/citizens-api';
import { templatesApi, type MessageTemplate, type TemplateLine } from '@/lib/shared/templates-api';
import {
  campaignsApi,
  campaignVariables,
  campaignMediaType,
  type CampaignAttachment,
  renderMappedText,
  type Mapping,
  type Row,
  type CreateCampaign,
} from '@/lib/shared/campaigns-api';
import { MAX_CAMPAIGN_RECIPIENTS, validateCampaignRows } from '@/lib/shared/campaign-csv';
import { CsvAudience, VariableMapping, selectClass } from '@/components/shared/CsvAudienceMapping';

const steps = ['Configuración', 'Audiencia', 'Variables', 'Resumen'];
const fields = ['name', 'lastName', 'phone', 'email', 'neighborhood'];
function citizenRow(c: Citizen): Row {
  return Object.fromEntries(fields.map((k) => [k, String(c[k as keyof Citizen] ?? '')]));
}
export function CampaignWizard() {
  const router = useRouter();
  const { can } = usePermissions();
  const [step, setStep] = useState(1),
    [name, setName] = useState(''),
    [purpose, setPurpose] = useState('');
  const [lines, setLines] = useState<TemplateLine[]>([]),
    [lineId, setLineId] = useState('');
  const [template, setTemplate] = useState<MessageTemplate>();
  const templateId = template?.id ?? '';
  const [source, setSource] = useState<'csv' | 'citizen'>('csv');
  const [headers, setHeaders] = useState<string[]>([]),
    [rows, setRows] = useState<Row[]>([]),
    [phoneColumn, setPhoneColumn] = useState('');
  const [selected, setSelected] = useState<Record<string, Citizen>>({});
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [mappings, setMappings] = useState<Record<string, Mapping>>({}),
    [consent, setConsent] = useState(false);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<CampaignAttachment>();
  const [previewFile, setPreviewFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const mediaType = campaignMediaType(template);
  const submission = useRef<{ serialized: string; key: string } | undefined>(undefined);
  const sending = useRef(false);
  const stepContent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stepContent.current?.scrollTo({ top: 0 });
  }, [step]);
  useEffect(() => {
    const ids = [...new Set(new URLSearchParams(window.location.search).getAll('citizenId'))]
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      .slice(0, MAX_CAMPAIGN_RECIPIENTS);
    if (!ids.length) return;
    let active = true;
    setLoadingAudience(true);
    void Promise.all(ids.map((id) => citizensApi.get(id)))
      .then((results) => {
        if (!active) return;
        const eligible = results.flatMap((result) =>
          result.ok && result.data.citizen.phone && result.data.citizen.consentGiven
            ? [result.data.citizen]
            : [],
        );
        setSelected(Object.fromEntries(eligible.map((citizen) => [citizen.id, citizen])));
        setSource('citizen');
        if (eligible.length !== ids.length) {
          setError(
            `${ids.length - eligible.length} ciudadano(s) no se agregaron porque no tienen teléfono, consentimiento o ya no están disponibles.`,
          );
        }
        setLoadingAudience(false);
      })
      .catch(() => {
        if (active) {
          setError(
            'No se pudo cargar la audiencia seleccionada. Vuelve a Ciudadanos e inténtalo de nuevo.',
          );
          setLoadingAudience(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  // The wizard owns the URL so it survives the upload step unmounting.
  useEffect(() => {
    if (!previewFile) {
      setPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(previewFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewFile]);
  useEffect(() => {
    let active = true;
    templatesApi
      .lines()
      .then((data) => {
        if (active) setLines(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const variables = campaignVariables(template);
  const audienceRows = source === 'csv' ? rows : Object.values(selected).map(citizenRow);
  const phoneField = source === 'csv' ? phoneColumn : 'phone';
  const validate = (through: number): string | undefined => {
    if (loadingAudience) return 'Espera a que termine de cargar la audiencia';
    if (!name.trim() || !purpose.trim() || !template)
      return 'Completa el nombre, propósito y plantilla';
    if (through >= 3 && mediaType && !attachment) return 'Carga el adjunto de la plantilla';
    if (through >= 2) {
      if (!audienceRows.length || !phoneField)
        return 'Selecciona destinatarios y columna del teléfono';
      if (audienceRows.length > MAX_CAMPAIGN_RECIPIENTS) return 'Máximo 2000 destinatarios';
      const issue = validateCampaignRows(
        audienceRows,
        phoneField,
        mappings,
        through >= 3 ? variables.map((v) => v.key) : [],
      );
      if (issue) return issue;
    }
  };
  const launch = async () => {
    if (sending.current) return;
    const issue = validate(3);
    if (issue) {
      setError(issue);
      return;
    }
    if (!consent) {
      setError('Confirma el consentimiento de la audiencia');
      return;
    }
    const payload: CreateCampaign = {
      name,
      purpose,
      lineId,
      templateId,
      consentConfirmed: true,
      ...(attachment ? { attachmentId: attachment.id } : {}),
      mappings: Object.fromEntries(variables.map((v) => [v.key, mappings[v.key]])),
      audience:
        source === 'csv'
          ? { source, phoneColumn, rows }
          : { source, citizenIds: Object.keys(selected) },
    };
    const serialized = JSON.stringify(payload);
    if (new Blob([serialized]).size > 8 * 1024 * 1024) {
      setError('La audiencia procesada supera 8 MB; reduce filas o columnas');
      return;
    }
    if (submission.current?.serialized !== serialized)
      submission.current = { serialized, key: crypto.randomUUID() };
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await campaignsApi.create(payload, submission.current.key);
      router.push(`/admin/campanas/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la campaña');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const previewRow = audienceRows[0] ?? {};
  // Hidrata la vista previa global con el primer destinatario y las reglas de mapeo.
  const headerComponent = template?.components.find((c) => c.type === 'HEADER');
  const bodyComponent = template?.components.find((c) => c.type === 'BODY');
  const footerComponent = template?.components.find((c) => c.type === 'FOOTER');
  const previewButtons = template?.components.flatMap((c) => c.buttons ?? []) ?? [];
  const previewHeader = headerComponent?.text
    ? renderMappedText(headerComponent.text, 'HEADER', mappings, previewRow)
    : undefined;
  const previewBody = renderMappedText(bodyComponent?.text, 'BODY', mappings, previewRow);
  const previewFooter = footerComponent?.text ?? '';
  const previewMedia = mediaType
    ? {
        kind: mediaType,
        url: previewUrl ?? attachment?.url,
        name: previewFile?.name ?? attachment?.filename,
      }
    : undefined;
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col gap-4 overflow-hidden p-4 sm:gap-6 sm:p-6 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:p-3">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold">Nueva campaña</h1>
        <p className="text-muted-foreground [@media(max-height:500px)]:hidden">
          Configura un mensaje y personalízalo para tu audiencia.
        </p>
      </div>
      <nav aria-label="Pasos de creación" className="shrink-0">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {steps.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                aria-current={step === i + 1 ? 'step' : undefined}
                disabled={busy || uploading || i + 1 > step}
                onClick={() => {
                  setError('');
                  setStep(i + 1);
                }}
                className={`w-full rounded-md border p-3 text-left text-sm focus-visible:outline-primary disabled:cursor-default [@media(max-height:500px)]:p-2 [@media(max-height:500px)]:text-xs ${step === i + 1 ? 'border-primary bg-primary/10 font-semibold' : 'text-muted-foreground'}`}
              >
                {i + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div
        ref={stepContent}
        role="region"
        aria-label={`Contenido de ${steps[step - 1]}`}
        tabIndex={0}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain"
      >
        {error && (
          <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">
            {error}
          </p>
        )}
        {loadingAudience && (
          <p role="status" className="text-sm text-muted-foreground">
            Cargando ciudadanos seleccionados…
          </p>
        )}
        <fieldset
          disabled={busy || uploading || loadingAudience}
          className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-6"
        >
          {step === 1 && (
            <>
              <label className="block space-y-1">
                <span>Nombre de la campaña</span>
                <Input maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span>Propósito</span>
                <Input
                  maxLength={1000}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span>Línea de WhatsApp</span>
                <select
                  className={selectClass}
                  value={lineId}
                  onChange={(e) => {
                    setLineId(e.target.value);
                    setTemplate(undefined);
                    setAttachment(undefined);
                    setPreviewFile(undefined);
                    setMappings({});
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
              <CampaignTemplatePicker
                key={lineId}
                lineId={lineId}
                value={template}
                onChange={(value) => {
                  setTemplate(value);
                  setMappings({});
                  setAttachment(undefined);
                  setPreviewFile(undefined);
                }}
              />
              <p className="text-sm text-muted-foreground">
                Se muestran plantillas aprobadas con encabezado de texto, imagen, video o documento
                y botones de respuesta, teléfono o URL.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <label className="block space-y-1">
                <span>Origen de la audiencia</span>
                <select
                  className={selectClass}
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value as 'csv' | 'citizen');
                    setMappings({});
                    setError('');
                  }}
                >
                  <option value="csv">Subir CSV</option>
                  {can('ciudadanos.view') && (
                    <option value="citizen">Ciudadanos registrados</option>
                  )}
                </select>
              </label>
              {source === 'csv' ? (
                <CsvAudience
                  headers={headers}
                  rows={rows}
                  phoneColumn={phoneColumn}
                  onPhoneColumn={setPhoneColumn}
                  onChange={(h, r) => {
                    setHeaders(h);
                    setRows(r);
                    setMappings({});
                  }}
                />
              ) : (
                <CampaignAudiencePicker selected={selected} onChange={setSelected} />
              )}
            </>
          )}
          {step === 3 && (
            <>
              {mediaType && (
                <CampaignMediaUpload
                  kind={mediaType}
                  name={name}
                  lineId={lineId}
                  templateId={templateId}
                  value={attachment}
                  preview={previewFile ? previewMedia : undefined}
                  onFileChange={setPreviewFile}
                  onChange={setAttachment}
                  onBusy={setUploading}
                />
              )}
              <VariableMapping
                variables={variables}
                fields={source === 'csv' ? headers : fields}
                mappings={mappings}
                onChange={setMappings}
              />
            </>
          )}
          {step === 4 && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start">
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">{name}</h2>
                <p>{purpose}</p>
                <p>
                  {audienceRows.length} destinatarios · {template?.name} · {template?.language}
                </p>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    Confirmo que los destinatarios dieron su consentimiento para recibir estos
                    mensajes por WhatsApp.
                  </span>
                </label>
              </div>
              <div className="lg:sticky lg:top-6">
                <WhatsAppMobilePreview
                  lineName={lines.find((l) => l.id === lineId)?.name ?? ''}
                  header={previewHeader}
                  media={previewMedia}
                  body={previewBody}
                  footer={previewFooter}
                  buttons={previewButtons}
                  caption="Vista previa con el primer destinatario."
                />
              </div>
            </div>
          )}
        </fieldset>
      </div>
      <div className="flex shrink-0 justify-between gap-3 border-t bg-background pt-4 [@media(max-height:500px)]:pt-2">
        <Button
          variant="outline"
          disabled={busy || uploading || loadingAudience}
          onClick={() => {
            setError('');
            if (step === 1) router.push('/admin/campanas');
            else setStep(step - 1);
          }}
        >
          {step === 1 ? 'Cancelar' : 'Atrás'}
        </Button>
        {step < 4 ? (
          <Button
            disabled={busy || uploading || loadingAudience}
            onClick={() => {
              const issue = validate(step);
              setError(issue ?? '');
              if (!issue) setStep(step + 1);
            }}
          >
            Continuar
          </Button>
        ) : (
          <Button
            disabled={busy || uploading || loadingAudience || !consent}
            onClick={() => void launch()}
          >
            {busy ? 'Creando campaña…' : 'Lanzar campaña'}
          </Button>
        )}
      </div>
    </div>
  );
}
