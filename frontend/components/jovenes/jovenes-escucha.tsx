'use client';

import { JOVENES_IMAGES, JOVENES_INTERESES } from '@/components/jovenes/jovenes-content';
import { Checkbox } from '@/components/ui/checkbox';
import { PhoneInputWithCountry } from '@/components/ui/phone-input-with-country';
import { useRegistroCiudadano } from '@/hooks/useRegistroCiudadano';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, Mail, MapPin, User } from 'lucide-react';
import Image from 'next/image';

export function JovenesEscucha() {
  const {
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
  } = useRegistroCiudadano();

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
    <section id="escucha" className="scroll-mt-20 overflow-hidden bg-muted py-20 md:py-24">
      <div className="mx-auto grid max-w-7xl items-start gap-12 px-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
        >
          <h2 className="text-balance text-3xl font-black leading-tight text-foreground md:text-5xl">
            ¡Haz que tu voz se escuche <span className="text-accent-teal-dark">de verdad!</span>
          </h2>
          <p className="mt-4 max-w-lg text-pretty text-muted-foreground">
            Registra tu propuesta. La canalizamos con el mismo flujo de registro ciudadano: barrio,
            contacto y temas que te importan.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {JOVENES_IMAGES.escucha.map((photo) => (
              <div key={photo.alt} className="relative aspect-4/3 overflow-hidden rounded-xl">
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  sizes="(min-width: 1024px) 18vw, 45vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.1 }}
        >
          {isSuccess ? (
            <div className="rounded-2xl border border-border bg-white p-7 text-center shadow-xl">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-teal/15">
                <CheckCircle2 className="h-7 w-7 text-accent-teal-dark" />
              </div>
              <h3 className="mb-2 text-xl font-black text-foreground">¡Propuesta enviada!</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Gracias, <strong>{formData.fullName.trim()}</strong>. Tu registro desde{' '}
                <strong>{barrioNombre}</strong> ya está en la red de atención. Te contactaremos
                pronto.
              </p>
              <button
                type="button"
                onClick={reset}
                className="mt-6 text-sm font-semibold text-primary hover:underline"
              >
                Enviar otra propuesta
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="space-y-3.5 overflow-hidden rounded-2xl border border-border bg-white shadow-xl"
            >
              <div className="bg-primary px-6 py-4">
                <h3 className="text-lg font-black text-white">Registro de solicitud</h3>
                <p className="text-xs text-white/70">Envía tu propuesta en un par de minutos</p>
              </div>
              <div className="space-y-3.5 px-5 pb-6 pt-2 sm:px-6">
                {errors.form ? (
                  <p
                    className="rounded-lg bg-destructive/5 px-3 py-2 text-center text-xs text-destructive"
                    role="alert"
                  >
                    {errors.form}
                  </p>
                ) : null}
                {barriosError ? (
                  <p className="text-center text-xs text-destructive" role="alert">
                    {barriosError}
                  </p>
                ) : null}

                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    name="fullName"
                    autoComplete="name"
                    placeholder="Nombre"
                    required
                    value={formData.fullName}
                    onChange={(e) => handleChange('fullName', e.target.value)}
                    onBlur={() => handleBlur('fullName')}
                    className={cn(
                      'h-11 w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2',
                      errors.fullName ||
                        (touched.fullName && validationStatus.fullName === 'invalid')
                        ? 'border-destructive focus:ring-destructive/30'
                        : 'border-border focus:ring-accent-teal/40 focus:border-accent-teal',
                    )}
                  />
                </div>

                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    onBlur={() => handleBlur('email')}
                    className={cn(
                      'h-11 w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2',
                      errors.email || (touched.email && validationStatus.email === 'invalid')
                        ? 'border-destructive focus:ring-destructive/30'
                        : 'border-border focus:ring-accent-teal/40 focus:border-accent-teal',
                    )}
                  />
                </div>

                <PhoneInputWithCountry
                  id="jovenes-phone"
                  value={formData.phone}
                  onChange={(value) => handleChange('phone', value)}
                  onBlur={() => handleBlur('phone')}
                  defaultCountry="MX"
                  invalid={phoneShowError}
                  className="h-11 rounded-xl"
                />
                {phoneShowError ? (
                  <p className="-mt-2 text-xs text-destructive">
                    {errors.phone ?? 'Ingresá un teléfono válido.'}
                  </p>
                ) : null}

                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <select
                    aria-label="Barrio o colonia"
                    required
                    disabled={barriosLoading || barrios.length === 0}
                    value={formData.neighborhoodId}
                    onChange={(e) => handleChange('neighborhoodId', e.target.value)}
                    onBlur={() => handleBlur('neighborhoodId')}
                    className={cn(
                      'h-11 w-full appearance-none rounded-xl border bg-white py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2',
                      errors.neighborhoodId
                        ? 'border-destructive'
                        : 'border-border focus:ring-accent-teal/40 focus:border-accent-teal',
                      formData.neighborhoodId ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <option value="">
                      {barriosLoading ? 'Cargando barrios…' : 'Selecciona tu barrio'}
                    </option>
                    {barrios.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-foreground">Temas de interés</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {JOVENES_INTERESES.map(({ id, label }) => (
                      <label
                        key={id}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs',
                          formData.interests.includes(id)
                            ? 'border-accent-teal bg-accent-teal/10 font-medium text-foreground'
                            : 'border-border text-muted-foreground',
                        )}
                      >
                        <Checkbox
                          id={`jovenes-interest-${id}`}
                          checked={formData.interests.includes(id)}
                          onCheckedChange={() => toggleInterest(id)}
                          className="shrink-0 data-[state=checked]:border-accent-teal-dark data-[state=checked]:bg-accent-teal-dark"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-snug text-muted-foreground">
                  <Checkbox
                    id="jovenes-consent"
                    checked={formData.consentGiven}
                    onCheckedChange={(checked) => handleChange('consentGiven', checked === true)}
                    className="mt-0.5 shrink-0 data-[state=checked]:border-accent-teal-dark data-[state=checked]:bg-accent-teal-dark"
                  />
                  <span>
                    Acepto el tratamiento de mis datos personales para fines de gestión de
                    propuestas y participación juvenil en Cintalapa de Figueroa, Chiapas.
                  </span>
                </label>
                {errors.consentGiven ? (
                  <p className="text-xs text-destructive">{errors.consentGiven}</p>
                ) : null}

                <button
                  type="submit"
                  disabled={submitDisabled}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent-teal text-sm font-black text-accent-teal-foreground transition-colors hover:bg-accent-teal-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    'Envía tu propuesta'
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </section>
  );
}
