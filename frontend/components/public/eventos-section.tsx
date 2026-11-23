'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  CalendarOff,
  Check,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Phone,
  User,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PhoneInputWithCountry } from '@/components/ui/phone-input-with-country';
import { toDigitsE164 } from '@/lib/phone-utils';
import type { PublicEventoItem } from '@/lib/public-eventos-api';
import { publicEventosApi } from '@/lib/public-eventos-api';

type EventoCard = {
  id: string;
  fechaLine1: string;
  fechaLine2: string;
  fechaLine3: string;
  hora: string;
  titulo: string;
  lugar: string;
  desc: string;
  cupo: string;
};

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatWeekRangeLabel(weekStartsOn: string, weekEndsOn: string): string {
  const s = parseYmdLocal(weekStartsOn);
  const e = parseYmdLocal(weekEndsOn);
  const opt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  return `${s.toLocaleDateString('es-MX', opt)} – ${e.toLocaleDateString('es-MX', opt)}`;
}

function mapApiEventToCard(event: PublicEventoItem, timeZone: string): EventoCard {
  const start = new Date(event.startsAt);
  const w = new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone }).format(start);
  const dayNum = new Intl.DateTimeFormat('es-MX', { day: 'numeric', timeZone }).format(start);
  const mon = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone }).format(start);
  const hora = new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(start);

  const lugar =
    event.locationName?.trim() || event.address?.trim() || 'Lugar pendiente por confirmar';
  const cupo =
    event.capacity === null || event.capacity === undefined
      ? 'Cupo abierto'
      : `${event.capacity} lugares`;

  return {
    id: event.id,
    fechaLine1: (w.charAt(0).toUpperCase() + w.slice(1)).replace('.', ''),
    fechaLine2: dayNum,
    fechaLine3: mon.replace('.', ''),
    hora,
    titulo: event.title,
    lugar,
    desc: event.description?.trim() || 'Jornada de atención y servicios para la comunidad.',
    cupo,
  };
}

interface RegistroState {
  fullName: string;
  phone: string;
  email: string;
  consentGiven: boolean;
}

export function EventosSection() {
  const [eventos, setEventos] = useState<EventoCard[]>([]);
  const [weekLabel, setWeekLabel] = useState<string>('');
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedEvento, setSelectedEvento] = useState<string | null>(null);
  const [registro, setRegistro] = useState<RegistroState>({
    fullName: '',
    phone: '',
    email: '',
    consentGiven: false,
  });
  const [registrados, setRegistrados] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successHint, setSuccessHint] = useState<string | null>(null);

  const loadEventos = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    const res = await publicEventosApi.listSemana();
    setListLoading(false);
    if (!res.ok) {
      setListError(res.message);
      setEventos([]);
      return;
    }
    const tz = res.data.timezone || 'America/Mexico_City';
    setWeekLabel(formatWeekRangeLabel(res.data.weekStartsOn, res.data.weekEndsOn));
    setEventos(res.data.events.map((e) => mapApiEventToCard(e, tz)));
  }, []);

  useEffect(() => {
    void loadEventos();
  }, [loadEventos]);

  const evento = useMemo(
    () => eventos.find((e) => e.id === selectedEvento) ?? null,
    [eventos, selectedEvento],
  );

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    if (!registro.fullName.trim() || !registro.phone.trim() || !selectedEvento) return;
    setModalError(null);
    setSuccessHint(null);
    setLoading(true);
    const phone = toDigitsE164(registro.phone);
    const payload = {
      fullName: registro.fullName.trim(),
      phone,
      ...(registro.email.trim() ? { email: registro.email.trim() } : {}),
      ...(registro.consentGiven
        ? { consentGiven: true as const }
        : { consentGiven: false as const }),
    };
    const res = await publicEventosApi.registrarAsistencia(selectedEvento, payload);
    setLoading(false);
    if (!res.ok) {
      setModalError(res.message);
      return;
    }
    setRegistrados((prev) => new Set([...prev, selectedEvento]));
    if (!res.data.citizen.profileComplete) {
      setSuccessHint(
        '¡Listo! Si todavía no completas tu perfil para dar seguimiento a tus solicitudes, puedes hacerlo por nuestra línea de WhatsApp cuando quieras.',
      );
    } else {
      setSelectedEvento(null);
      setRegistro({ fullName: '', phone: '', email: '', consentGiven: false });
    }
  }

  function closeModal() {
    setSelectedEvento(null);
    setRegistro({ fullName: '', phone: '', email: '', consentGiven: false });
    setModalError(null);
    setSuccessHint(null);
  }

  return (
    <section id="eventos" className="py-24 px-6 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <span className="text-primary text-sm font-bold uppercase tracking-widest mb-3 block">
            Agenda territorial
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-foreground text-balance">
            Jornadas de atención ciudadana
            <br />
            <span className="text-primary">Servicio social en tu colonia o ejido.</span>
          </h2>
          <p className="text-muted-foreground mt-4 max-w-xl mx-auto leading-relaxed">
            Brigadas de orientación, gestión de reportes y apoyo directo en colonias y ejidos de
            Cintalapa. Regístrate y asiste a la jornada más cercana a tu comunidad.
          </p>
          {weekLabel ? (
            <p className="text-muted-foreground text-sm mt-2 font-medium">{weekLabel}</p>
          ) : null}
        </motion.div>

        {listLoading ? (
          <div className="flex justify-center py-16 text-muted-foreground gap-2 items-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando jornadas…
          </div>
        ) : listError ? (
          <p className="text-center text-destructive text-sm py-8">{listError}</p>
        ) : eventos.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="max-w-lg mx-auto"
            role="status"
            aria-live="polite"
          >
            <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-primary/25 bg-linear-to-b from-muted/80 to-muted/40 px-6 py-10 sm:px-10 sm:py-12 text-center shadow-sm">
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/6"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-primary/5"
                aria-hidden
              />
              <div className="relative">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-md shadow-primary/25">
                  <CalendarOff className="h-8 w-8 stroke-[1.75]" aria-hidden />
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-foreground text-balance tracking-tight">
                  Esta semana no hay jornadas publicadas
                </h3>
                {weekLabel ? (
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    La agenda corresponde al período{' '}
                    <span className="font-semibold text-foreground/90">{weekLabel}</span>. Cuando
                    confirmemos fechas y lugares, aparecerán aquí automáticamente.
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    Cuando confirmemos fechas y lugares para la semana en curso, podrás verlos en
                    esta sección.
                  </p>
                )}
                <p className="mt-6 text-xs sm:text-sm text-muted-foreground/90 leading-relaxed border-t border-border/60 pt-6">
                  Te invitamos a regresar en unos días o a{' '}
                  <a
                    href="#sumate"
                    className="font-bold text-primary underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-primary/30 rounded"
                  >
                    completar el registro ciudadano
                  </a>{' '}
                  para recibir novedades. ¡Gracias por tu interés!
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {eventos.map(
              ({ id, fechaLine1, fechaLine2, fechaLine3, hora, titulo, lugar, desc, cupo }, i) => {
                const yaRegistrado = registrados.has(id);
                return (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.08 }}
                    className="bg-muted rounded-2xl p-6 border border-border hover:border-primary/30 transition-all duration-200 flex gap-5 overflow-hidden"
                  >
                    <div className="shrink-0 w-16 text-center">
                      <div className="bg-primary rounded-xl py-3 px-2">
                        <div className="text-white text-[10px] font-bold uppercase tracking-wider leading-tight">
                          {fechaLine1}
                        </div>
                        <div className="text-white text-2xl font-black leading-none mt-1">
                          {fechaLine2}
                        </div>
                        <div className="text-white/70 text-[10px] font-semibold uppercase">
                          {fechaLine3}
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-foreground text-base mb-1">{titulo}</h3>
                      <div className="flex flex-col gap-1 mb-3">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground text-xs">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          {hora}
                          <span className="text-border">·</span>
                          <span className="text-secondary font-semibold">{cupo}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{lugar}</span>
                        </div>
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed mb-4">{desc}</p>
                      {yaRegistrado ? (
                        <div className="inline-flex items-center gap-2 text-sm font-bold text-primary">
                          <Check className="w-4 h-4 stroke-3" />
                          Registro confirmado
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setModalError(null);
                            setSuccessHint(null);
                            setSelectedEvento(id);
                          }}
                          className="bg-primary hover:bg-primary-hover text-white text-sm font-bold px-5 py-2 rounded-full transition-colors"
                        >
                          Confirmar asistencia
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              },
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedEvento && evento && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && closeModal()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    <span className="text-primary text-xs font-bold uppercase tracking-wide">
                      Registro — Jornada
                    </span>
                  </div>
                  <h3 className="font-black text-foreground text-lg">{evento.titulo}</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    {evento.fechaLine1} {evento.fechaLine2} {evento.fechaLine3} · {evento.hora}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => closeModal()}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {successHint ? (
                <div className="space-y-4">
                  <p className="text-sm text-foreground leading-relaxed">{successHint}</p>
                  <button
                    type="button"
                    onClick={() => closeModal()}
                    className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 rounded-xl transition-colors"
                  >
                    Entendido
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRegistro} className="space-y-4">
                  {modalError ? (
                    <p className="text-sm text-destructive font-medium">{modalError}</p>
                  ) : null}
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Tu nombre completo"
                      required
                      value={registro.fullName}
                      onChange={(e) => setRegistro((p) => ({ ...p, fullName: e.target.value }))}
                      className="w-full pl-10 pr-4 py-3 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <PhoneInputWithCountry
                      id="evento-phone"
                      value={registro.phone}
                      onChange={(value) => setRegistro((p) => ({ ...p, phone: value }))}
                      defaultCountry="MX"
                      className="h-11 rounded-xl pl-10"
                      placeholder="Número de WhatsApp"
                    />
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      placeholder="Correo electrónico (opcional)"
                      value={registro.email}
                      onChange={(e) => setRegistro((p) => ({ ...p, email: e.target.value }))}
                      className="w-full pl-10 pr-4 py-3 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={registro.consentGiven}
                      onChange={(e) =>
                        setRegistro((p) => ({ ...p, consentGiven: e.target.checked }))
                      }
                      className="mt-0.5 rounded border-border"
                    />
                    <span>
                      Acepto el tratamiento de datos personales conforme al aviso de privacidad del
                      sitio.
                    </span>
                  </label>
                  <button
                    type="submit"
                    disabled={loading || !registro.consentGiven}
                    className="w-full bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-3" />
                        Confirmar asistencia
                      </>
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
