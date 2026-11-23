'use client';

import { JOVENES_IMAGES } from '@/components/jovenes/jovenes-content';
import { motion } from 'framer-motion';
import Image from 'next/image';

export function JovenesCompromiso() {
  const [main, second, third] = JOVENES_IMAGES.compromiso;

  return (
    <section className="overflow-hidden bg-white py-20 md:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -28 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="mb-3 block text-sm font-bold uppercase tracking-widest text-primary">
            Nuestro compromiso
          </span>
          <h2 className="text-balance text-3xl font-black leading-tight text-foreground md:text-5xl">
            Tú eres nuestra prioridad:{' '}
            <span className="text-primary">creando oportunidades reales.</span>
          </h2>
          <p className="mt-6 text-pretty leading-relaxed text-muted-foreground">
            El gobierno cercano que mereces se mide en aulas, primeros empleos y espacios donde las
            juventudes de Cintalapa se escuchan de verdad. No basta con invitarte a un evento: hay
            que abrir rutas de educación, trabajo y desarrollo que se puedan recorrer desde tu
            barrio.
          </p>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            A través de Nexo Comercial canalizamos becas, oficios, cultura, deporte y salud mental
            con seguimiento claro. Tu energía ya está en la calle; nosotros ponemos el puente para
            que se convierta en proyecto, empleo o propuesta con respuesta.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 28 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative mx-auto grid max-w-lg grid-cols-2 gap-3"
        >
          <div className="relative col-span-2 aspect-videooverflow-hidden rounded-2xl">
            <Image
              src={main.src}
              alt={main.alt}
              fill
              sizes="(min-width: 1024px) 28vw, 90vw"
              className="object-cover"
            />
          </div>
          <div className="relative aspect-4/3 overflow-hidden rounded-2xl">
            <Image
              src={second.src}
              alt={second.alt}
              fill
              sizes="(min-width: 1024px) 14vw, 45vw"
              className="object-cover"
            />
          </div>
          <div className="relative aspect-4/3 overflow-hidden rounded-2xl">
            <Image
              src={third.src}
              alt={third.alt}
              fill
              sizes="(min-width: 1024px) 14vw, 45vw"
              className="object-cover"
            />
          </div>
          <div className="pointer-events-none absolute -bottom-3 -left-3 h-16 w-16 rounded-2xl bg-accent-teal/80" />
          <div className="pointer-events-none absolute -top-3 -right-3 h-12 w-12 rounded-full border-4 border-primary/30" />
        </motion.div>
      </div>
    </section>
  );
}
