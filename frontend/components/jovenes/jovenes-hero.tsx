'use client';

import { JOVENES_IMAGES } from '@/components/jovenes/jovenes-content';
import { motion } from 'framer-motion';
import Image from 'next/image';

export function JovenesHero() {
  return (
    <section className="relative overflow-hidden bg-sidebar pt-24 pb-16 md:pt-28 md:pb-24">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, #14b8a6 0, transparent 28%), radial-gradient(circle at 80% 0%, #9b3244 0, transparent 32%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="mb-5 inline-flex rounded-full border border-accent-teal/40 bg-accent-teal/15 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-accent-teal"
          >
            Voz Ciudadana · Juventud Cintalapa
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="text-balance text-4xl font-black leading-[1.05] text-white md:text-6xl"
          >
            ¡Es tu momento, Cintalapa!
            <span className="mt-2 block text-accent-teal">El futuro es joven.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2 }}
            className="mt-6 max-w-lg text-pretty text-base leading-relaxed text-white/70 md:text-lg"
          >
            Empoderamos a las juventudes de Cintalapa de Figueroa para construir un municipio
            inclusivo: becas, primer empleo, cultura, deporte y una voz con seguimiento real.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.32 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <a
              href="#ejes"
              className="inline-flex h-13 items-center justify-center rounded-full bg-accent-teal px-9 text-base font-black text-accent-teal-foreground shadow-lg shadow-black/30 transition-colors hover:bg-accent-teal-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
            >
              Conoce tus beneficios
            </a>
            <a
              href="#escucha"
              className="inline-flex h-13 items-center justify-center rounded-full bg-white px-9 text-base font-black text-sidebar shadow-lg shadow-black/20 transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              Participa aquí
            </a>
          </motion.div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {JOVENES_IMAGES.hero.map((photo, i) => (
            <motion.div
              key={photo.src + i}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, delay: 0.15 + i * 0.06 }}
              className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-white/10"
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(min-width: 1024px) 12vw, 30vw"
                className="object-cover"
                priority={i < 3}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
