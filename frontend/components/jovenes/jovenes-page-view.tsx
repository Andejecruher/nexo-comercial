'use client';

import { JovenesCompromiso } from '@/components/jovenes/jovenes-compromiso';
import {
  JOVENES_EJES,
  JOVENES_FOOTER_CTA,
  JOVENES_FOOTER_LINKS,
  JOVENES_GALERIA,
  JOVENES_NAV_CTA,
  JOVENES_NAV_LINKS,
  JOVENES_TESTIMONIOS,
} from '@/components/jovenes/jovenes-content';
import { JovenesEscucha } from '@/components/jovenes/jovenes-escucha';
import { JovenesHero } from '@/components/jovenes/jovenes-hero';
import { JovenesJornadas } from '@/components/jovenes/jovenes-jornadas';
import { GaleriaSection } from '@/components/public/galeria-section';
import { PropuestasSection } from '@/components/public/propuestas-section';
import { PublicFooter } from '@/components/public/public-footer';
import { PublicNav } from '@/components/public/public-nav';
import { TeamSection } from '@/components/public/team-section';
import { WhatsAppFab } from '@/components/public/whatsapp-fab';
import { legalRoutes } from '@/lib/legal-config';

export function JovenesPageView() {
  return (
    <>
      <PublicNav links={JOVENES_NAV_LINKS} cta={JOVENES_NAV_CTA} homeHref="/jovenes" />
      <main>
        <JovenesHero />
        <JovenesCompromiso />
        <PropuestasSection
          id="ejes"
          eyebrow="Tus rutas de crecimiento"
          title="Ejes de acción juvenil"
          description="Ocho caminos para estudiar, trabajar, emprender, crear, moverte y hacer que tu voz cuente en Cintalapa."
          items={JOVENES_EJES}
          tone="muted"
        />
        <JovenesJornadas />
        <JovenesEscucha />
        <GaleriaSection
          id="proyectos"
          eyebrow="Galería de acciones"
          title="Juntos creando el impacto que queremos"
          subtitle="Proyectos comunitarios, mentorías y trabajo en equipo con las juventudes de Cintalapa."
          items={JOVENES_GALERIA}
          tone="dark"
        />
        <TeamSection
          id="voces-jovenes"
          eyebrow="Liderazgo joven"
          title="Lo que dicen nuestros líderes jóvenes"
          description="Voces de quienes ya participan en jornadas, foros y redes de Cintalapa."
          items={JOVENES_TESTIMONIOS}
          tone="white"
        />
      </main>
      <PublicFooter
        links={JOVENES_FOOTER_LINKS}
        contactLinks={[
          { label: 'Envía tu propuesta', href: '/jovenes#escucha' },
          { label: 'Jornadas juveniles', href: '/jovenes#jornadas' },
          { label: 'Aviso de privacidad', href: legalRoutes.privacy },
          { label: 'Términos y condiciones', href: legalRoutes.terms },
        ]}
        cta={JOVENES_FOOTER_CTA}
      />
      <WhatsAppFab message="Hola, quiero sumarme a la red de jóvenes de Cintalapa" />
    </>
  );
}
