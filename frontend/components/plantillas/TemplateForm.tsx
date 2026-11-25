'use client';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { ArrowLeft, Info, Plus, Smartphone, Trash2 } from 'lucide-react';
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  EMPTY_TEMPLATE,
  templateToForm,
  variableKeys,
  renderTemplateText,
  templatesApi,
  type TemplateFormValues,
  type TemplateLine,
  type MessageTemplate,
} from '@/lib/shared/templates-api';
import { VariableEditor } from '@/components/plantillas/VariableEditor';
import { WhatsAppMobilePreview } from '@/components/shared/messaging/whatsapp-mobile-preview';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';
function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  const labelId = useId();
  if (help && isValidElement(children)) {
    return (
      <div className="grid gap-2 text-sm">
        <div className="flex items-center gap-1">
          <span id={labelId}>{label}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={`Más información sobre ${label.replace(' *', '')}`}
                title={`Más información sobre ${label.replace(' *', '')}`}
              >
                <Info className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="max-w-72">
              {help}
            </TooltipContent>
          </Tooltip>
        </div>
        {cloneElement(children, { 'aria-labelledby': labelId } as never)}
      </div>
    );
  }
  return (
    <label className="grid gap-2 text-sm">
      {label}
      {children}
    </label>
  );
}
export function TemplateForm({
  lines,
  initialLineId,
  template,
  readOnly = false,
  onBack,
  onSaved,
}: {
  lines: TemplateLine[];
  initialLineId: string;
  template?: MessageTemplate;
  readOnly?: boolean;
  onBack: () => void;
  onSaved: (line: string) => void;
}) {
  const [lineId, setLineId] = useState(initialLineId);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File>();
  const [media, setMedia] = useState<{ url: string; name: string }>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const uploadController = useRef<AbortController | undefined>(undefined);
  const exampleInputs = useRef<Record<string, HTMLInputElement | null>>({});
  useEffect(
    () => () => {
      uploadController.current?.abort();
      uploadController.current = undefined;
    },
    [],
  );
  useEffect(() => {
    if (!file) {
      setMedia(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setMedia({ url, name: file.name });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TemplateFormValues>({
    defaultValues: template ? templateToForm(template) : EMPTY_TEMPLATE,
  });
  const values = useWatch({ control }) as TemplateFormValues;
  const { fields, append, remove } = useFieldArray({ control, name: 'buttons' });
  const keys = variableKeys(values.body ?? '');
  const auth = values.category === 'AUTHENTICATION';
  // El contenedor resuelve las variables y adapta el contenido hasta que el
  // preview global sea un componente "tonto".
  const preview = {
    lineName: lines.find((l) => l.id === lineId)?.name ?? '',
    header: !auth && values.headerType === 'TEXT' ? values.header : undefined,
    media:
      !auth && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(values.headerType)
        ? {
            kind: values.headerType as 'IMAGE' | 'VIDEO' | 'DOCUMENT',
            url: media?.url,
            name: media?.name,
          }
        : undefined,
    body: auth
      ? `123456 es tu código de verificación.${values.addSecurityRecommendation ? ' Por tu seguridad, no compartas este código.' : ''}`
      : renderTemplateText(values.body, (key) => values.examples[key] ?? ''),
    footer: auth ? `Este código vence en ${values.codeExpirationMinutes} minutos.` : values.footer,
    buttons: auth ? [{ text: 'Copiar código' }] : values.buttons,
    caption: auth
      ? 'Texto ilustrativo; Meta localiza el mensaje OTP.'
      : 'La vista previa utiliza los valores de muestra.',
  };
  const save = handleSubmit(async (data) => {
    if (uploading) return;
    if (auth)
      data = {
        ...data,
        headerType: 'NONE',
        header: '',
        body: '',
        footer: '',
        examples: {},
        buttons: [],
        parameterFormat: 'POSITIONAL',
      };
    setError('');
    try {
      if (template) await templatesApi.edit(lineId, template.id, data);
      else await templatesApi.create(lineId, data);
      onSaved(lineId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible guardar');
    }
  });
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 space-y-6 overflow-y-auto p-4 pb-24 sm:p-6 lg:pb-6">
        <Button variant="ghost" onClick={onBack} disabled={isSubmitting || uploading}>
          <ArrowLeft className="mr-2 size-4" />
          <span className="hidden sm:inline">Regresar a la lista de plantillas</span>
          <span className="sm:hidden">Regresar</span>
        </Button>
        <form
          onSubmit={save}
          className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]"
        >
          <fieldset disabled={readOnly || isSubmitting || uploading} className="min-w-0 space-y-6">
            <section className="space-y-6 rounded-lg border bg-background p-6">
              <div>
                <h2 className="font-semibold">Configuración general</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Información básica de la plantilla
                </p>
              </div>
              <Field label="Línea de WhatsApp *">
                <select
                  aria-label="Línea de WhatsApp"
                  className={selectClass}
                  value={lineId}
                  disabled={!!template}
                  onChange={(e) => {
                    setLineId(e.target.value);
                    setValue('mediaHandle', '');
                    setFile(undefined);
                  }}
                >
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} · {l.phone || l.wabaId}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nombre de la plantilla *">
                <Input
                  placeholder="mensaje_bienvenida"
                  disabled={!!template}
                  {...register('name', {
                    required: 'El nombre es obligatorio',
                    pattern: {
                      value: /^[a-z0-9_]+$/,
                      message: 'Usa minúsculas, números y guiones bajos',
                    },
                    maxLength: 512,
                  })}
                />
              </Field>
              <p className="-mt-4 text-xs text-muted-foreground">
                Usa minúsculas y guiones bajos, por ejemplo: mensaje_bienvenida.
              </p>
              {errors.name && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
              <div className="grid gap-4 md:grid-cols-3">
                <Field
                  label="Categoría *"
                  help="Selecciona el propósito de tu plantilla (ej. Marketing, Servicios, Utilidad) para cumplir con las políticas de envío."
                >
                  <select className={selectClass} {...register('category')}>
                    <option value="MARKETING">Marketing</option>
                    <option value="UTILITY">Utilidad</option>
                    <option value="AUTHENTICATION">Autenticación</option>
                  </select>
                </Field>
                <Field
                  label="Idioma *"
                  help="Elige el idioma en el que está redactado el mensaje. Los destinatarios recibirán la plantilla en esta variante."
                >
                  <select className={selectClass} disabled={!!template} {...register('language')}>
                    <option value="es_MX">Español (México)</option>
                    <option value="es">Español</option>
                    <option value="en_US">Inglés (EE. UU.)</option>
                    <option value="pt_BR">Portugués (Brasil)</option>
                  </select>
                </Field>
                <Field
                  label="Formato de variables *"
                  help="Usa {{1}}, {{2}} o nombres como {{nombre}}. En modo nombrado, escribe el identificador entre las llaves."
                >
                  <select
                    className={selectClass}
                    disabled={!!template || auth}
                    {...register('parameterFormat')}
                  >
                    <option value="POSITIONAL">Número: {'{{1}}'}</option>
                    <option value="NAMED">Nombre: {'{{nombre}}'}</option>
                  </select>
                </Field>
              </div>
            </section>
            <section className="space-y-5 rounded-lg border bg-background p-6">
              <div>
                <h2 className="font-semibold">Contenido de la plantilla</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configura el mensaje y sus botones
                </p>
              </div>
              {auth ? (
                <div className="space-y-4">
                  <p className="rounded bg-accent-teal/10 p-3 text-sm text-accent-teal-dark">
                    Meta genera el texto de verificación en el idioma seleccionado. Incluye un botón
                    para copiar el código.
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" {...register('addSecurityRecommendation')} />
                    Incluir recomendación de seguridad
                  </label>
                  <Field label="Vigencia del código (minutos)">
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      {...register('codeExpirationMinutes', {
                        valueAsNumber: true,
                        min: 1,
                        max: 90,
                      })}
                    />
                  </Field>
                </div>
              ) : (
                <>
                  <Field label="Encabezado (opcional)">
                    <select
                      className={selectClass}
                      {...register('headerType', {
                        onChange: () => {
                          setValue('mediaHandle', '');
                          setFile(undefined);
                        },
                      })}
                    >
                      <option value="NONE">Sin encabezado</option>
                      <option value="TEXT">Texto</option>
                      <option value="IMAGE">Imagen</option>
                      <option value="VIDEO">Video</option>
                      <option value="DOCUMENT">Documento</option>
                    </select>
                  </Field>
                  {values.headerType === 'TEXT' && (
                    <Field label="Texto del encabezado">
                      <Input
                        maxLength={60}
                        {...register('header', {
                          validate: (v) =>
                            values.headerType !== 'TEXT' || !!v.trim() || 'Escribe el encabezado',
                        })}
                      />
                    </Field>
                  )}
                  {!['NONE', 'TEXT'].includes(values.headerType) && (
                    <Field label="Archivo de muestra *">
                      <Input
                        type="file"
                        accept={
                          values.headerType === 'IMAGE'
                            ? 'image/png,image/jpeg'
                            : values.headerType === 'VIDEO'
                              ? 'video/mp4'
                              : 'application/pdf'
                        }
                        onChange={async (e) => {
                          const selected = e.target.files?.[0];
                          if (!selected) return;
                          e.target.value = '';
                          const max = values.headerType === 'IMAGE' ? 5 : 16;
                          if (selected.size > max * 1024 * 1024) {
                            setError(`El archivo debe pesar menos de ${max} MB`);
                            return;
                          }
                          uploadController.current?.abort();
                          const controller = new AbortController();
                          uploadController.current = controller;
                          setUploading(true);
                          setError('');
                          setValue('mediaHandle', '');
                          setFile(undefined);
                          try {
                            const result = await templatesApi.uploadSample(
                              lineId,
                              selected,
                              controller.signal,
                            );
                            if (
                              uploadController.current === controller &&
                              !controller.signal.aborted
                            ) {
                              setValue('mediaHandle', result.handle, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              setFile(selected);
                            }
                          } catch (e) {
                            if (
                              uploadController.current === controller &&
                              !controller.signal.aborted
                            )
                              setError(
                                e instanceof Error ? e.message : 'No se pudo subir la muestra',
                              );
                          } finally {
                            if (uploadController.current === controller) {
                              uploadController.current = undefined;
                              setUploading(false);
                            }
                          }
                        }}
                      />
                      <Input
                        type="hidden"
                        {...register('mediaHandle', {
                          validate: (v) =>
                            ['NONE', 'TEXT'].includes(values.headerType) ||
                            !!v.trim() ||
                            'Agrega la muestra multimedia',
                        })}
                      />
                      <span className="text-xs text-muted-foreground">
                        {uploading
                          ? 'Subiendo muestra a Meta…'
                          : values.mediaHandle
                            ? 'Muestra registrada en Meta. Puedes reemplazarla.'
                            : 'La muestra se enviará a Meta para su revisión. JPG/PNG: 5 MB; MP4/PDF: 16 MB.'}
                      </span>
                    </Field>
                  )}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">Cuerpo *</span>
                    </div>
                    <Controller
                      name="body"
                      control={control}
                      rules={{
                        validate: (v) => auth || !!v.trim() || 'El cuerpo es obligatorio',
                        maxLength: { value: 1024, message: 'Máximo 1024 caracteres' },
                      }}
                      render={({ field }) => (
                        <VariableEditor
                          disabled={readOnly || isSubmitting || uploading}
                          value={field.value}
                          parameterFormat={values.parameterFormat}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          invalid={!!errors.body}
                          onVariable={(key) => {
                            exampleInputs.current[key]?.focus();
                            exampleInputs.current[key]?.select();
                          }}
                          onRenameVariable={(oldKey, newKey) => {
                            const examples = { ...values.examples };
                            examples[newKey] = examples[oldKey] ?? '';
                            delete examples[oldKey];
                            setValue('examples', examples, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }}
                          onInsertVariable={() => {
                            return `{{${keys.length + 1}}}`;
                          }}
                        />
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      {values.body.length} / 1024 caracteres · Clic para editar el nombre; doble
                      clic para editar la muestra. Con teclado: Enter y Alt+Enter.
                    </p>
                    {errors.body && (
                      <p role="alert" className="text-sm text-destructive">
                        {errors.body.message}
                      </p>
                    )}
                  </div>
                  {keys.length > 0 && (
                    <div className="space-y-3 rounded-md bg-muted/40 p-4">
                      <h3 className="text-sm font-medium">Valores de muestra para revisión</h3>
                      {keys.map((key) => {
                        const sample = register(`examples.${key}`, {
                          required: !auth,
                          maxLength: 200,
                        });
                        return (
                          <Field key={key} label={`Muestra de {{${key}}} *`}>
                            <Input
                              {...sample}
                              ref={(input) => {
                                sample.ref(input);
                                exampleInputs.current[key] = input;
                              }}
                            />
                          </Field>
                        );
                      })}
                    </div>
                  )}
                  <Field label="Pie de página (opcional)">
                    <Input
                      placeholder="Texto del pie de página"
                      maxLength={60}
                      {...register('footer')}
                    />
                  </Field>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Botones</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={fields.length >= 3}
                      onClick={() => append({ type: 'QUICK_REPLY', text: '' })}
                    >
                      <Plus className="size-4" />
                      Agregar botón
                    </Button>
                  </div>
                  {!fields.length && (
                    <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                      Añade enlaces, un teléfono o respuestas rápidas para interactuar con tu
                      mensaje.
                    </p>
                  )}
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]"
                    >
                      <Field label="Tipo de botón">
                        <select className={selectClass} {...register(`buttons.${index}.type`)}>
                          <option value="QUICK_REPLY">Respuesta rápida</option>
                          <option value="URL">Enlace</option>
                          <option value="PHONE_NUMBER">Teléfono</option>
                        </select>
                      </Field>
                      <Field label="Texto del botón">
                        <Input
                          maxLength={25}
                          {...register(`buttons.${index}.text`, { required: !auth })}
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        className="self-end"
                        aria-label="Quitar botón"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                      {values.buttons[index]?.type === 'URL' && (
                        <Field label="Enlace HTTPS">
                          <Input
                            type="url"
                            placeholder="https://ejemplo.mx"
                            {...register(`buttons.${index}.url`, { required: !auth })}
                          />
                        </Field>
                      )}
                      {values.buttons[index]?.type === 'PHONE_NUMBER' && (
                        <Field label="Teléfono internacional">
                          <Input
                            placeholder="+525512345678"
                            {...register(`buttons.${index}.phone_number`, { required: !auth })}
                          />
                        </Field>
                      )}
                    </div>
                  ))}
                </>
              )}
            </section>
          </fieldset>
          <aside className="space-y-4 lg:sticky lg:top-6">
            {uploading && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  uploadController.current?.abort();
                  uploadController.current = undefined;
                  setUploading(false);
                }}
              >
                Cancelar carga
              </Button>
            )}
            <div className="hidden lg:block">
              <WhatsAppMobilePreview {...preview} />
            </div>
            {!readOnly && (
              <Button
                className="w-full"
                type="submit"
                disabled={isSubmitting || uploading || !lineId}
              >
                {isSubmitting
                  ? 'Enviando a Meta…'
                  : template
                    ? 'Guardar cambios'
                    : 'Publicar plantilla'}
              </Button>
            )}
            {!readOnly && (
              <p className="text-xs text-muted-foreground">
                Meta revisará el contenido. Guardar no garantiza su aprobación.
              </p>
            )}
            {Object.keys(errors).length > 0 && (
              <p role="alert" className="text-sm text-destructive">
                Revisa los campos obligatorios y sus límites.
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
          </aside>
        </form>
      </div>
      <Button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="fixed bottom-5 right-5 z-40 h-12 rounded-full px-5 shadow-lg lg:hidden"
        aria-label="Ver vista previa"
      >
        <Smartphone className="size-4" />
        Vista previa
      </Button>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista previa</DialogTitle>
            <DialogDescription>
              Así se verá la plantilla en el teléfono del ciudadano.
            </DialogDescription>
          </DialogHeader>
          <WhatsAppMobilePreview {...preview} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
