'use client';

import { JOVENES_IMAGES } from '@/components/jovenes/jovenes-content';
import type { PublicEventoItem } from '@/lib/public-eventos-api';
import { publicEventosApi } from '@/lib/public-eventos-api';
import { motion } from 'framer-motion';
import { CalendarDays, Loader2, MapPin, Search } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';

function matchesQuery(event: PublicEventoItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    event.title,
    event.locationName ?? '',
    event.address ?? '',
    event.description ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function JovenesJornadas() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [events, setEvents] = useState<PublicEventoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await publicEventosApi.listSemana();
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      setEvents([]);
      return;
    }
    setEvents(res.data.events);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const results = useMemo(
    () => events.filter((e) => matchesQuery(e, submitted)),
    [events, submitted],
  );

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(query);
  }

  return (
    <section
      id="jornadas"
      className="scroll-mt-20 overflow-hidden border-t-4 border-accent-teal/50 bg-sidebar py-20 md:py-24"
    >
      <div className="mx-auto grid max-w-7xl items-start gap-12 px-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
        >
          <h2 className="text-balance text-3xl font-black leading-tight text-white md:text-5xl">
            ¡Jornadas juveniles: <span className="text-accent-teal">actívate en tu barrio!</span>
          </h2>
          <p className="mt-4 max-w-lg text-pretty text-white/70">
            Busca la jornada más cercana. Filtramos los eventos de la semana por nombre de colonia,
            barrio o lugar publicado.
          </p>

          <form onSubmit={handleSearch} className="mt-8 space-y-3">
            <label
              htmlFor="barrio-jornada"
              className="text-xs font-bold uppercase tracking-widest text-white/60"
            >
              Ingresa tu barrio
            </label>
            <input
              id="barrio-jornada"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ejemplo: Colonia Centro, Barrio San Roque"
              aria-label="Ingresa tu barrio para buscar eventos"
              className="h-12 w-full rounded-xl border border-white/15 bg-white px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-teal"
            />
            <button
              type="submit"
              className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-accent-teal px-8 text-base font-black text-accent-teal-foreground shadow-lg shadow-black/30 transition-colors hover:bg-accent-teal-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal sm:w-auto"
            >
              <Search className="h-4 w-4" />
              Buscar eventos
            </button>
          </form>

          <div className="mt-8 space-y-3">
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando jornadas de la semana…
              </p>
            ) : error ? (
              <p className="text-sm text-red-200" role="alert">
                {error}
              </p>
            ) : results.length === 0 ? (
              <p className="text-sm text-white/60">
                {submitted
                  ? `No encontramos jornadas que coincidan con “${submitted}” esta semana.`
                  : 'No hay jornadas publicadas esta semana. Vuelve pronto.'}
              </p>
            ) : (
              results.map((event) => (
                <article
                  key={event.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 text-white"
                >
                  <p className="font-black">{event.title}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-white/60">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {event.locationName?.trim() || event.address?.trim() || 'Lugar por confirmar'}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-white/50">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    {new Date(event.startsAt).toLocaleString('es-MX', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </article>
              ))
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="relative col-span-2 aspect-16/8 overflow-hidden rounded-2xl">
            <Image
              src={JOVENES_IMAGES.jornadas[0].src}
              alt={JOVENES_IMAGES.jornadas[0].alt}
              fill
              sizes="(min-width: 1024px) 36vw, 90vw"
              className="object-cover"
            />
          </div>
          <div className="relative aspect-4/3 overflow-hidden rounded-2xl">
            <Image
              src={JOVENES_IMAGES.jornadas[1].src}
              alt={JOVENES_IMAGES.jornadas[1].alt}
              fill
              sizes="(min-width: 1024px) 18vw, 45vw"
              className="object-cover"
            />
          </div>
          <div className="relative aspect-4/3 overflow-hidden rounded-2xl">
            <Image
              src={JOVENES_IMAGES.jornadas[2].src}
              alt={JOVENES_IMAGES.jornadas[2].alt}
              fill
              sizes="(min-width: 1024px) 18vw, 45vw"
              className="object-cover"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
