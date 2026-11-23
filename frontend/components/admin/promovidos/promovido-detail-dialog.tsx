'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  formatBirthDate,
  formatDateTime,
  promovidoAge,
  promovidoFullName,
  promovidoPhone,
  promovidoSex,
  telHref,
  whatsappHref,
} from '@/lib/promovido-mapper';
import { formatPhoneDisplay } from '@/lib/promovido-schema';
import { promovidosApi, type PromovidoDetail } from '@/lib/promovidos-api';
import {
  BadgeCheck,
  CalendarClock,
  IdCard,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  ScrollText,
  UserRound,
  X as XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type PromovidoDetailDialogProps = {
  promovidoId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (detail: PromovidoDetail) => void;
};

const EMPTY = '—';

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          mono
            ? 'font-mono text-sm wrap-break-word text-foreground'
            : 'text-sm wrap-break-word text-foreground'
        }
      >
        {value?.trim() ? value : EMPTY}
      </dd>
    </div>
  );
}

function Block({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof IdCard;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-muted/30 p-4" aria-label={title}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="wrap-break-word">{title}</span>
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando expediente">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-36 w-full" />
    </div>
  );
}

export function PromovidoDetailDialog({
  promovidoId,
  open,
  onOpenChange,
  onEdit,
}: PromovidoDetailDialogProps) {
  const [detail, setDetail] = useState<PromovidoDetail | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!promovidoId) return;
    setLoading(true);
    setError(null);
    const result = await promovidosApi.get(promovidoId);
    if (result.ok) {
      setDetail(result.data.promovido);
    } else {
      setDetail(undefined);
      setError(result.message);
    }
    setLoading(false);
  }, [promovidoId]);

  useEffect(() => {
    if (!open) return;
    setDetail(undefined);
    load();
  }, [open, load]);

  const name = detail ? promovidoFullName(detail) : '';
  const phone = detail ? promovidoPhone(detail) : undefined;
  const leaderPhone = detail?.leader.phone?.trim() || undefined;
  const age = detail ? promovidoAge(detail) : undefined;
  const sex = detail ? promovidoSex(detail) : undefined;
  const verified = detail?.origin === 'ocr';

  const territory = detail
    ? [detail.data.municipality, detail.section.state?.name].filter(Boolean).join(', ')
    : '';
  const district = detail?.section.district
    ? `Distrito ${detail.section.district.code}${
        detail.section.district.name ? ` — ${detail.section.district.name}` : ''
      }`
    : undefined;
  const street = detail
    ? [detail.data.address, detail.credential.postalCode && `C.P. ${detail.credential.postalCode}`]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogHeader className="relative shrink-0 border-b bg-primary px-5 py-4 text-primary-foreground sm:px-6">
          <DialogClose
            className="absolute top-4 right-4 rounded-sm p-1 text-primary-foreground/80 transition-opacity hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:outline-none"
            aria-label="Cerrar expediente"
          >
            <XIcon className="h-5 w-5" aria-hidden="true" />
          </DialogClose>
          <DialogTitle className="pr-10 text-lg font-black wrap-break-word sm:text-xl">
            {loading && !detail ? 'Expediente del promovido' : name || 'Expediente del promovido'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Expediente completo del promovido con identificación, territorio y contacto.
          </DialogDescription>
          {detail && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Badge
                className={
                  detail.isActive
                    ? 'border-transparent bg-emerald-100 text-emerald-900'
                    : 'border-transparent bg-amber-100 text-amber-900'
                }
              >
                {detail.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
              <Badge className="border-primary-foreground/40 bg-transparent text-primary-foreground">
                {detail.origin === 'ocr' ? 'Captura OCR credencial' : 'Registro manual'}
              </Badge>
              <Badge className="border-primary-foreground/40 bg-transparent text-primary-foreground">
                Sección {detail.section.sectionCode}
              </Badge>
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {loading && !detail && <DetailSkeleton />}

          {error && (
            <div
              role="alert"
              className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            >
              <p>{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={load}>
                Reintentar
              </Button>
            </div>
          )}

          {detail && (
            <Tabs defaultValue="general" className="gap-4">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="registro">Registro y notas</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4">
                <Block
                  icon={IdCard}
                  title="Identificación oficial"
                  action={
                    verified ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700">
                        <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                        Credencial verificada
                      </span>
                    ) : undefined
                  }
                >
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Clave de elector" value={detail.data.voterKey} mono />
                    <Field label="CURP" value={detail.data.curp} mono />
                    <Field
                      label="Sexo"
                      value={sex === 'H' ? 'Hombre' : sex === 'M' ? 'Mujer' : undefined}
                    />
                    <Field label="Fecha de nacimiento" value={formatBirthDate(detail)} />
                    <Field label="Edad" value={age !== undefined ? `${age} años` : undefined} />
                    <Field label="Vigencia de la credencial" value={detail.credential.validUntil} />
                    <Field label="Año de registro" value={detail.credential.registrationYear} />
                  </dl>
                </Block>

                <Block icon={MapPin} title="Ubicación territorial y electoral">
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field
                      label="Sección electoral"
                      value={detail.credential.electoralSection ?? detail.section.sectionCode}
                      mono
                    />
                    <Field label="Colonia / barrio" value={detail.data.neighborhood} />
                    <Field label="Localidad" value={detail.data.locality} />
                    <Field label="Municipio y estado" value={territory} />
                    <Field label="Distrito electoral" value={district} />
                    <Field label="Domicilio" value={street} />
                  </dl>
                </Block>

                <Block icon={Phone} title={`Contacto de ${name || 'el promovido'}`}>
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field
                      label="Teléfono móvil del promovido"
                      value={phone ? formatPhoneDisplay(phone) : undefined}
                    />
                    <Field label="Correo electrónico del promovido" value={detail.citizen?.email} />
                    <Field label="Alta en el sistema" value={formatDateTime(detail.createdAt)} />
                  </dl>
                  {phone && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={whatsappHref(phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir WhatsApp con el promovido ${name}`}
                        >
                          <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                          WhatsApp al promovido
                        </a>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <a href={telHref(phone)} aria-label={`Llamar al promovido ${name}`}>
                          <Phone className="mr-2 h-4 w-4" aria-hidden="true" />
                          Llamar al promovido
                        </a>
                      </Button>
                    </div>
                  )}
                </Block>

                <Block icon={UserRound} title="Estructura política">
                  <p className="mb-3 text-xs text-muted-foreground">
                    Quién tiene asignado a este promovido dentro de la estructura territorial.
                  </p>
                  <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                    >
                      {initials(detail.leader.fullName)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Líder promotor asignado</p>
                      <p className="text-sm font-medium wrap-break-word">
                        {detail.leader.fullName}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Teléfono móvil del líder"
                      value={leaderPhone ? formatPhoneDisplay(leaderPhone) : undefined}
                    />
                    <Field label="Correo electrónico del líder" value={detail.leader.email} />
                  </dl>
                </Block>
              </TabsContent>

              <TabsContent value="registro" className="space-y-4">
                <Block icon={CalendarClock} title="Trazabilidad del registro">
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field
                      label="Origen del registro"
                      value={
                        detail.origin === 'ocr'
                          ? 'Captura OCR de credencial'
                          : 'Registro manual en campo'
                      }
                    />
                    <Field label="Alta en el sistema" value={formatDateTime(detail.createdAt)} />
                    <Field label="Última actualización" value={formatDateTime(detail.updatedAt)} />
                    <Field
                      label="Vigencia del registro"
                      value={detail.isActive ? 'Activo' : 'Inactivo'}
                    />
                    <Field label="Folio del expediente" value={detail.id} mono />
                    <Field label="Ciudadano vinculado en CRM" value={detail.citizen?.id} mono />
                  </dl>
                </Block>

                <Block icon={ScrollText} title="Observaciones">
                  <p className="text-sm wrap-break-word text-muted-foreground">
                    {detail.data.observations?.trim() || 'Sin observaciones registradas.'}
                  </p>
                </Block>

                {detail.citizen?.email && (
                  <Block icon={Mail} title="Contacto alterno">
                    <Button asChild variant="outline" size="sm">
                      <a href={`mailto:${detail.citizen.email}`}>
                        <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                        Escribir correo
                      </a>
                    </Button>
                  </Block>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-background px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {phone && (
            <Button asChild variant="outline">
              <a
                href={whatsappHref(phone)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir WhatsApp con el promovido ${name}`}
              >
                <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                WhatsApp al promovido
              </a>
            </Button>
          )}
          <Button type="button" disabled={!detail} onClick={() => detail && onEdit(detail)}>
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
            Editar promovido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
