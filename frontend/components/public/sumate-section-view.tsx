import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PhoneInputWithCountry } from '@/components/ui/phone-input-with-country';
import type { RegistroFormData, RegistroValidationStatus } from '@/hooks/useRegistroCiudadano';
import type { PublicBarrio } from '@/lib/public-registro-api';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Loader2,
  Mail,
  MapPin,
  Phone,
  User,
} from 'lucide-react';
import { useId, useState } from 'react';

const INTERESES = [
  { id: 'agua', label: 'Agua Potable' },
  { id: 'seguridad', label: 'Seguridad Pública' },
  { id: 'campo', label: 'Campo y Agricultura' },
  { id: 'salud', label: 'Salud' },
  { id: 'educacion', label: 'Educación' },
  { id: 'empleo', label: 'Empleo y Economía' },
] as const;

type BarrioComboboxProps = {
  value: string;
  onValueChange: (neighborhoodId: string) => void;
  onBlur: () => void;
  barrios: PublicBarrio[];
  disabled: boolean;
  placeholder: string;
  hasError: boolean;
  errorMessage?: string;
};

function BarrioCombobox({
  value,
  onValueChange,
  onBlur,
  barrios,
  disabled,
  placeholder,
  hasError,
  errorMessage,
}: BarrioComboboxProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  const selected = barrios.find((b) => b.id === value);
  const triggerText = selected?.name ?? placeholder;

  return (
    <div className="w-full space-y-1.5">
      <p className="text-xs font-semibold text-foreground">Barrio o colonia</p>
      <div className="relative w-full">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) onBlur();
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-haspopup="listbox"
              aria-label={triggerText}
              disabled={disabled}
              className={cn(
                'relative flex h-11 w-full min-h-11 items-center rounded-xl border bg-white py-0 text-left text-sm font-normal shadow-none',
                /* pl: hueco bajo MapPin (izq.) · pr: hueco bajo chevron (der.) — anular hover outline que puede “borrar” el texto */
                'pl-11 pr-11 hover:bg-white! hover:text-foreground! dark:hover:bg-input/40! dark:hover:text-foreground!',
                value ? 'text-foreground' : 'text-muted-foreground',
                hasError
                  ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25'
                  : 'border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25',
              )}
            >
              <span className="block min-h-5 min-w-0 flex-1 truncate text-left text-sm leading-snug text-inherit pl-9">
                {triggerText}
              </span>
              <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 shrink-0 -translate-y-1/2 text-muted-foreground opacity-70" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            id={listId}
            align="start"
            side="bottom"
            sideOffset={6}
            collisionPadding={12}
            className={cn(
              'z-60 overflow-hidden rounded-xl border border-border p-0 shadow-lg',
              'min-w-[min(100%,18rem)] max-w-[min(100vw-1.5rem,26rem)] w-(--radix-popover-trigger-width)',
            )}
          >
            <Command className="rounded-none border-0 bg-popover text-foreground shadow-none">
              <CommandInput
                placeholder="Buscar barrio…"
                autoComplete="off"
                className="h-9 border-0 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <CommandList className="max-h-44 overflow-y-auto overscroll-contain">
                <CommandEmpty className="py-3 text-xs text-muted-foreground">
                  No se encontró ningún barrio.
                </CommandEmpty>
                <CommandGroup className="p-1">
                  {barrios.map((b) => (
                    <CommandItem
                      key={b.id}
                      value={`${b.name} ${b.id}`}
                      onSelect={() => {
                        onValueChange(b.id);
                        setOpen(false);
                      }}
                      className={cn(
                        'cursor-pointer rounded-lg py-2 text-sm text-foreground',
                        'hover:bg-primary/10 hover:text-foreground',
                        'aria-selected:bg-primary/12 aria-selected:text-foreground!',
                        'data-[selected=true]:bg-primary/12 data-[selected=true]:text-foreground!',
                      )}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0 text-primary',
                          value === b.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-foreground">{b.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {errorMessage && <p className="text-destructive text-xs pl-0.5">{errorMessage}</p>}
    </div>
  );
}

export type SumateSectionViewProps = {
  formData: RegistroFormData;
  errors: Partial<Record<keyof RegistroFormData | 'form', string>>;
  isSubmitting: boolean;
  isSuccess: boolean;
  validationStatus: RegistroValidationStatus;
  handleChange: (field: keyof RegistroFormData, value: string | boolean) => void;
  handleSubmit: (e: React.FormEvent) => void;
  toggleInterest: (id: string) => void;
  touched: Partial<Record<keyof RegistroFormData, boolean>>;
  handleBlur: (field: keyof RegistroFormData) => void;
  barrios: PublicBarrio[];
  barriosLoading: boolean;
  barriosError: string | null;
  reset: () => void;
};

export function SumateSectionView({
  formData,
  errors,
  isSubmitting,
  isSuccess,
  validationStatus,
  handleChange,
  handleSubmit,
  toggleInterest,
  touched,
  handleBlur,
  barrios,
  barriosLoading,
  barriosError,
  reset,
}: SumateSectionViewProps) {
  const phoneValid = validationStatus.phone === 'valid';
  const phoneShowError =
    Boolean(errors.phone) || (Boolean(touched.phone) && formData.phone.length > 0 && !phoneValid);

  const barrioNombre = barrios.find((b) => b.id === formData.neighborhoodId)?.name ?? 'tu barrio';

  const submitDisabled =
    isSubmitting ||
    barriosLoading ||
    Boolean(barriosError) ||
    barrios.length === 0 ||
    validationStatus.fullName !== 'valid' ||
    validationStatus.phone !== 'valid' ||
    validationStatus.email === 'invalid' ||
    validationStatus.neighborhoodId !== 'valid' ||
    validationStatus.consent !== 'valid';

  return (
    <section
      id="sumate"
      className="relative overflow-hidden bg-sidebar py-14 md:py-16 px-4 sm:px-6"
    >
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="grid items-start gap-10 md:grid-cols-2 md:gap-12 lg:gap-14">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="md:sticky md:top-20"
          >
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
                <Check className="h-4 w-4 stroke-3 text-white" />
              </div>
              <div>
                <div className="text-lg font-black leading-none text-white">Voz Ciudadana</div>
                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/50">
                  Plataforma de Atención y Enlace Social
                </div>
              </div>
            </div>

            <h2 className="mb-4 text-balance text-3xl font-black leading-tight text-white md:text-4xl">
              Participación que se traduce en{' '}
              <span className="text-primary-light">gestión real.</span>
            </h2>
            <p className="text-pretty text-sm leading-relaxed text-white/60 md:text-[15px]">
              Regístrate para recibir información sobre jornadas de atención, seguimiento a tu
              reporte ciudadano y canales de participación en Cintalapa de Figueroa.
            </p>

            <div className="mt-6 space-y-2.5">
              {[
                'Avisos de jornadas de servicio social en tu zona',
                'Actualización sobre gestión de reportes ciudadanos',
                'Participación informada en las prioridades del territorio',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/30">
                    <Check className="h-2.5 w-2.5 stroke-3 text-primary-light" />
                  </div>
                  <span className="text-sm leading-relaxed text-white/70">{item}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            {isSuccess ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl bg-white p-6 text-center shadow-xl md:p-7"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle2 className="h-7 w-7 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-black text-foreground md:text-2xl">
                  ¡Registro completado!
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground md:text-[15px]">
                  Gracias, <strong>{formData.fullName.trim()}</strong>. Tu registro desde{' '}
                  <strong>{barrioNombre}</strong> ya está en nuestra base para atención y
                  seguimiento ciudadano. Te contactaremos pronto.
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="mt-6 text-sm font-semibold text-primary hover:underline"
                >
                  Registrar otra persona
                </button>
              </motion.div>
            ) : (
              <form
                onSubmit={(e) => void handleSubmit(e)}
                className="space-y-3.5 rounded-2xl bg-white p-5 shadow-xl sm:p-6 md:space-y-4"
              >
                <div className="mb-0.5 text-center">
                  <h3 className="text-lg font-black text-foreground md:text-xl">
                    Registro ciudadano
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
                    Gratuito · Seguro · 2 minutos
                  </p>
                </div>

                {errors.form && (
                  <p
                    className="rounded-lg bg-destructive/5 px-3 py-2 text-center text-xs text-destructive md:text-sm"
                    role="alert"
                  >
                    {errors.form}
                  </p>
                )}

                {barriosError && (
                  <p className="text-center text-xs text-destructive md:text-sm" role="alert">
                    {barriosError}
                  </p>
                )}

                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    name="fullName"
                    autoComplete="name"
                    placeholder="Nombre completo"
                    required
                    value={formData.fullName}
                    onChange={(e) => handleChange('fullName', e.target.value)}
                    onBlur={() => handleBlur('fullName')}
                    className={cn(
                      'h-11 w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm transition-colors focus:outline-none focus:ring-2',
                      errors.fullName ||
                        (touched.fullName && validationStatus.fullName === 'invalid')
                        ? 'border-destructive focus:ring-destructive/30 focus:border-destructive'
                        : 'border-border focus:ring-primary/30 focus:border-primary',
                    )}
                  />
                  {(errors.fullName ||
                    (touched.fullName && validationStatus.fullName === 'invalid')) && (
                    <p className="text-destructive text-xs mt-1 pl-1">
                      {errors.fullName ?? 'Usa al menos 2 caracteres.'}
                    </p>
                  )}
                </div>

                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <PhoneInputWithCountry
                    id="phone"
                    value={formData.phone}
                    onChange={(value) => handleChange('phone', value)}
                    onBlur={() => handleBlur('phone')}
                    defaultCountry="MX"
                    invalid={phoneShowError}
                    className="h-11 rounded-xl pl-10"
                  />
                  {touched.phone && phoneValid && (
                    <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
                  )}
                  {phoneShowError && (
                    <p className="text-destructive text-xs mt-1 pl-1">
                      {errors.phone ?? 'Ingresá un teléfono válido.'}
                    </p>
                  )}
                </div>

                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="Correo electrónico (opcional)"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    onBlur={() => handleBlur('email')}
                    className={cn(
                      'h-11 w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm transition-colors focus:outline-none focus:ring-2',
                      errors.email || (touched.email && validationStatus.email === 'invalid')
                        ? 'border-destructive focus:ring-destructive/30 focus:border-destructive'
                        : 'border-border focus:ring-primary/30 focus:border-primary',
                    )}
                  />
                  {(errors.email || (touched.email && validationStatus.email === 'invalid')) && (
                    <p className="text-destructive text-xs mt-1 pl-1">
                      {errors.email ?? 'Correo no válido.'}
                    </p>
                  )}
                </div>

                <BarrioCombobox
                  value={formData.neighborhoodId}
                  onValueChange={(id) => handleChange('neighborhoodId', id)}
                  onBlur={() => handleBlur('neighborhoodId')}
                  barrios={barrios}
                  disabled={barriosLoading || barrios.length === 0}
                  placeholder={barriosLoading ? 'Cargando barrios…' : 'Busca tu barrio'}
                  hasError={Boolean(
                    errors.neighborhoodId ||
                    (touched.neighborhoodId && validationStatus.neighborhoodId === 'empty'),
                  )}
                  errorMessage={
                    errors.neighborhoodId ??
                    (touched.neighborhoodId && validationStatus.neighborhoodId === 'empty'
                      ? 'Selecciona tu barrio.'
                      : undefined)
                  }
                />

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground md:text-sm">
                    Temas que te importan{' '}
                    <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    {INTERESES.map(({ id, label }) => (
                      <label
                        key={id}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs transition-all duration-150 sm:text-sm md:rounded-xl md:p-2.5',
                          formData.interests.includes(id)
                            ? 'border-primary bg-primary/5 text-foreground font-medium'
                            : 'border-border hover:border-primary/40 text-muted-foreground',
                        )}
                      >
                        <Checkbox
                          id={`interest-${id}`}
                          checked={formData.interests.includes(id)}
                          onCheckedChange={() => toggleInterest(id)}
                          className="border-muted-foreground data-[state=checked]:bg-primary data-[state=checked]:border-primary shrink-0"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-snug text-muted-foreground md:text-sm">
                  <Checkbox
                    id="consent-registro"
                    checked={formData.consentGiven}
                    onCheckedChange={(checked) => handleChange('consentGiven', checked === true)}
                    className={cn(
                      'mt-0.5 shrink-0 border-muted-foreground data-[state=checked]:border-primary data-[state=checked]:bg-primary',
                      errors.consentGiven && 'border-destructive',
                    )}
                  />
                  <span>
                    Acepto el tratamiento de mis datos personales para fines de gestión de reportes,
                    atención ciudadana y participación en Cintalapa de Figueroa, Chiapas.
                  </span>
                </label>
                {errors.consentGiven && (
                  <p className="-mt-1 pl-0.5 text-xs text-destructive">{errors.consentGiven}</p>
                )}

                <button
                  type="submit"
                  disabled={submitDisabled}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-black text-sm text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 md:h-12 md:text-base"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-5 w-5 stroke-3" />
                      Enviar registro
                    </>
                  )}
                </button>

                <p className="text-center text-[11px] leading-snug text-muted-foreground md:text-xs">
                  Tu información es confidencial y solo se usa para fines de atención ciudadana y
                  gestión social en Cintalapa de Figueroa, Chiapas.
                </p>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
