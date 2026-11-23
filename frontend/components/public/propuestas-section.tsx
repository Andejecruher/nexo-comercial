'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  CheckCircle2,
  Droplets,
  GraduationCap,
  HeartPulse,
  Home,
  Shield,
  TreePine,
  Wheat,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export interface Propuesta {
  icon: React.ElementType;
  title: string;
  desc: string;
  featured?: boolean;
  full: {
    paragraphs: string[];
    benefits: string[];
    phases?: string[];
  };
}

const PROPUESTAS: Propuesta[] = [
  {
    icon: Droplets,
    title: 'Gestión del Agua',
    desc: 'Recibimos y canalizamos reportes sobre desabasto, fugas y calidad del agua en todos los barrios de Cintalapa.',
    featured: true,
    full: {
      paragraphs: [
        'El acceso al agua potable es un derecho fundamental de cada familia en Cintalapa. A través de nuestra herramienta Voz Ciudadana, recopilamos los reportes de vecinos de más de 30 colonias sobre fallas en la red de distribución, desabasto y falta de mantenimiento, y los canalizamos ante las instancias responsables.',
        'Junto con las juntas vecinales y comités de agua, gestionamos la rehabilitación de infraestructura hidráulica, la instalación de sistemas de medición eficiente y el establecimiento de brigadas comunitarias de vigilancia que aseguren el servicio continuo.',
        'Apoyamos también la sensibilización comunitaria sobre el uso responsable del agua, coordinando talleres en escuelas, centros comunitarios y asambleas de barrio desde el equipo KAB.',
      ],
      benefits: [
        'Gestión de reportes de desabasto con seguimiento hasta su resolución',
        'Coordinación con comités locales para el mantenimiento autónomo de la red',
        'Vinculación para instalación de cisternas comunitarias en zonas de difícil acceso',
        'Reducción de enfermedades gastrointestinales en comunidades vulnerables',
        'Monitoreo permanente de la calidad del agua mediante análisis mensuales',
      ],
      phases: [
        'Paso 1: Recepción del reporte en el canal Voz Ciudadana',
        'Paso 2: Evaluación y mapeo por el equipo KAB',
        'Paso 3: Canalización y seguimiento vecinal',
      ],
    },
  },
  {
    icon: Shield,
    title: 'Seguridad Vecinal',
    desc: 'Gestionamos reportes de alumbrado, espacios de riesgo y coordinamos redes de apoyo mutuo en cada colonia.',
    featured: true,
    full: {
      paragraphs: [
        'La tranquilidad de los vecinos es el punto de partida de cualquier comunidad sostenible. A través de esta red gestionamos los reportes de falta de alumbrado, zonas de riesgo y ausencia de canales de comunicación entre vecinos que elevan la percepción de inseguridad.',
        'Conformamos redes de apoyo mutuo entre vecinos, con protocolos claros de comunicación y coordinación. Esta red trabaja en conjunto con instancias municipales para identificar y atender puntos críticos con rapidez desde Voz Ciudadana.',
        'Apoyamos a las colonias en la gestión de luminarias LED para calles oscuras y en la habilitación de espacios públicos seguros para la convivencia, dando seguimiento a cada solicitud registrada.',
      ],
      benefits: [
        'Seguimiento a reportes de alumbrado deficiente en calles identificadas por los vecinos',
        'Creación de redes de apoyo mutuo organizadas por colonia',
        'Canal de reporte ciudadano para incidencias en tiempo real',
        'Gestión de rehabilitación de espacios públicos como parques y canchas',
        'Jornadas de diagnóstico participativo bimestrales en cada barrio',
      ],
      phases: [
        'Paso 1: Recepción del reporte en el canal Voz Ciudadana',
        'Paso 2: Evaluación y mapeo por el equipo KAB',
        'Paso 3: Canalización y seguimiento vecinal',
      ],
    },
  },
  {
    icon: Wheat,
    title: 'Apoyo al Campo',
    desc: 'Apoyamos a productores agrícolas con gestión de acceso a créditos, asistencia técnica y mercados justos.',
    featured: true,
    full: {
      paragraphs: [
        'El campo de Cintalapa es fuente de vida, identidad y sustento para miles de familias. A través de esta red gestionamos el acceso a financiamiento, maquinaria y mercados justos que reconozcan el valor real del trabajo de los productores locales.',
        'Apoyamos a los productores en la vinculación con una bolsa de apoyo comunitario: microcréditos, asistencia técnica gratuita y conexión directa con mercados municipales. Priorizamos a productores de maíz, café, plátano y hortalizas.',
        'Acompañamos la organización de cooperativas agrícolas locales para que los vecinos del campo negocien en bloque mejores precios y reduzcan intermediarios, fortaleciendo la economía local desde la raíz.',
      ],
      benefits: [
        'Gestión de microcréditos con tasas preferenciales para productores locales',
        'Ferias de venta directa en el centro municipal, sin intermediarios',
        'Capacitación en técnicas de cultivo sostenible y manejo de suelos',
        'Vinculación con programas estatales de apoyo al campo',
        'Acompañamiento en la constitución de cooperativas agrícolas comunitarias',
      ],
      phases: [
        'Paso 1: Recepción del reporte en el canal Voz Ciudadana',
        'Paso 2: Evaluación y mapeo por el equipo KAB',
        'Paso 3: Canalización y seguimiento vecinal',
      ],
    },
  },
  {
    icon: HeartPulse,
    title: 'Brigadas de Salud',
    desc: 'Coordinamos brigadas médicas itinerantes con consulta, medicamentos gratuitos y prevención en cada colonia.',
    full: {
      paragraphs: [
        'La salud no debe depender de la distancia ni del dinero disponible. Coordinamos brigadas médicas itinerantes que visitan colonias y comunidades de manera programada, llevando consulta general, odontología básica y entrega de medicamentos esenciales sin costo.',
        'Apoyamos a las familias en el seguimiento de pacientes crónicos y en el acceso a talleres de prevención, acercando los servicios de salud a quienes más lo necesitan a través del equipo KAB.',
      ],
      benefits: [
        'Brigadas médicas mensuales en colonias periféricas y comunidades rurales',
        'Medicamentos esenciales gratuitos para adultos mayores y personas con discapacidad',
        'Talleres de prevención en salud sexual, nutrición y salud mental',
        'Expediente clínico comunitario para seguimiento de pacientes crónicos',
      ],
    },
  },
  {
    icon: GraduationCap,
    title: 'Enlace Educativo',
    desc: 'Gestionamos becas escolares, equipamiento tecnológico e internet en escuelas públicas de Cintalapa.',
    full: {
      paragraphs: [
        'La educación es la herramienta más poderosa para transformar comunidades. A través de este eje gestionamos el acceso a infraestructura tecnológica básica en escuelas de Cintalapa, reduciendo la brecha digital que pone en desventaja a nuestros niños.',
        'Apoyamos a las familias en la vinculación con programas de becas para estudiantes en situación de vulnerabilidad, y coordinamos programas de tutoría comunitaria con jóvenes y profesionistas locales como mentores.',
      ],
      benefits: [
        'Gestión de equipamiento tecnológico en escuelas públicas prioritarias',
        'Vinculación con becas escolares para familias en situación de vulnerabilidad',
        'Talleres de alfabetización digital para padres de familia',
        'Programa de tutoría comunitaria con jóvenes y profesionistas locales como mentores',
      ],
    },
  },
  // {
  //   icon: Briefcase,
  //   title: 'Empleo Local',
  //   desc: 'Apoyos a emprendedores de Cintalapa, microcreditos y ferias de empleo en el municipio.',
  //   full: {
  //     paragraphs: [
  //       'El empleo digno es la base de la estabilidad familiar. Muchos vecinos de Cintalapa cuentan con habilidades y oficios valiosos pero no tienen acceso a los recursos o redes necesarias para desarrollar su potencial productivo.',
  //       'A traves de ferias de empleo municipales, talleres de emprendimiento y un directorio de negocios locales, se busca conectar la oferta y demanda de trabajo dentro del propio municipio, reduciendo la necesidad de migrar.',
  //     ],
  //     benefits: [
  //       'Ferias de empleo trimestrales con participacion de empresas y negocios locales',
  //       'Microcreditos para emprendedores con planes de negocio avalados por comites vecinales',
  //       'Talleres gratuitos de oficios: electricidad, plomeria, costura, gastronomia y mas',
  //       'Directorio digital de proveedores y servicios locales de Cintalapa',
  //     ],
  //   },
  // },
  {
    icon: TreePine,
    title: 'Preservación Ambiental',
    desc: 'Coordinamos jornadas de reforestación, cuidado de ríos y manejo responsable de residuos en el municipio.',
    full: {
      paragraphs: [
        'El entorno natural de Cintalapa es parte de nuestra identidad y un patrimonio de las generaciones futuras. A través de esta red coordinamos acciones comunitarias frente a la deforestación, la contaminación de cuerpos de agua y el manejo inadecuado de residuos.',
        'Organizamos junto con escuelas, grupos vecinales y jóvenes voluntarios jornadas de reforestación para recuperar la cubierta vegetal de los cerros y márgenes de ríos. Paralelamente gestionamos la separación y disposición correcta de residuos sólidos en cada colonia.',
      ],
      benefits: [
        'Siembra de árboles nativos en cerros y barrancas del municipio',
        'Programa de separación de residuos con puntos de acopio en cada colonia',
        'Limpieza comunitaria mensual de ríos y cuerpos de agua',
        'Educación ambiental en escuelas primarias y secundarias del municipio',
      ],
    },
  },
  {
    icon: Home,
    title: 'Mejoramiento de Vivienda',
    desc: 'Acompañamos a familias en regularización de predios, gestión de apoyos y urbanización de colonias periféricas.',
    full: {
      paragraphs: [
        'Una vivienda digna es mucho más que cuatro paredes: es seguridad, salud y bienestar familiar. Acompañamos a las familias de Cintalapa en el proceso de regularización de predios, con asesoría jurídica gratuita, para que puedan acceder a apoyos gubernamentales y servicios básicos.',
        'Gestionamos apoyos materiales para mejoramiento de vivienda —techos, pisos firmes y muros seguros— y coordinamos la urbanización de calles en colonias periféricas, dando seguimiento a cada caso registrado en Voz Ciudadana.',
      ],
      benefits: [
        'Acompañamiento en regularización de predios para familias en situación irregular',
        'Asesoría jurídica gratuita para trámites de escrituración',
        'Gestión de apoyos de materiales de construcción para mejoramiento de vivienda',
        'Urbanización de calles en colonias periféricas: banquetas, alumbrado y drenaje',
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function PropuestaModal({ propuesta, onClose }: { propuesta: Propuesta; onClose: () => void }) {
  const Icon = propuesta.icon;
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={overlayRef}
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8"
        onClick={handleOverlayClick}
      >
        <motion.div
          key="panel"
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Header */}
          <div className="sticky top-0 bg-white z-10 flex items-start justify-between gap-4 px-7 pt-7 pb-5 border-b border-border">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <h2
                id="modal-title"
                className="font-black text-foreground text-xl leading-tight text-balance"
              >
                {propuesta.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="mt-1 shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-7 py-6 space-y-6">
            {/* Paragraphs */}
            <div className="space-y-4">
              {propuesta.full.paragraphs.map((p, i) => (
                <p key={i} className="text-muted-foreground text-sm leading-relaxed">
                  {p}
                </p>
              ))}
            </div>

            {/* Benefits */}
            <div>
              <h3 className="font-bold text-foreground text-sm uppercase tracking-wider mb-3">
                Impacto de la Gestión Comunitaria
              </h3>
              <ul className="space-y-2">
                {propuesta.full.benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Phases */}
            {propuesta.full.phases && (
              <div>
                <h3 className="font-bold text-foreground text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  Proceso de Atención de Reportes
                </h3>
                <ol className="space-y-2">
                  {propuesta.full.phases.map((phase, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span>{phase}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-7 pb-7">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function PropuestaCard({
  propuesta,
  featured,
  onOpen,
  delay,
}: {
  propuesta: Propuesta;
  featured?: boolean;
  onOpen: (p: Propuesta) => void;
  delay: number;
}) {
  const Icon = propuesta.icon;
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      onClick={() => onOpen(propuesta)}
      className={[
        'text-left w-full group rounded-2xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
        featured
          ? 'bg-white p-7 border-2 border-primary/20 hover:border-primary/50 hover:shadow-lg'
          : 'bg-white p-6 border border-border hover:border-primary/40 hover:shadow-md',
      ].join(' ')}
    >
      <div
        className={[
          'rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center mb-4 transition-colors',
          featured ? 'w-14 h-14 mb-5' : 'w-12 h-12',
        ].join(' ')}
      >
        <Icon className={featured ? 'w-7 h-7 text-primary' : 'w-6 h-6 text-primary'} />
      </div>
      <h3
        className={['font-black text-foreground mb-2', featured ? 'text-lg' : 'text-base'].join(
          ' ',
        )}
      >
        {propuesta.title}
      </h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{propuesta.desc}</p>
      <span className="mt-4 inline-block text-primary text-xs font-semibold group-hover:underline">
        Conoce este eje de gestión
      </span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export type PropuestasSectionProps = {
  id?: string;
  eyebrow?: string;
  title?: React.ReactNode;
  description?: string;
  items?: Propuesta[];
  tone?: 'muted' | 'white';
};

export function PropuestasSection({
  id = 'propuestas',
  eyebrow = 'Es tiempo de mujeres',
  title = (
    <>
      Ejes de atención ciudadana
      <br />
      <span className="text-primary">Cintalapa tiene voz de mujer.</span>
    </>
  ),
  description = 'El equipo KAB pone a tu disposición estos canales de gestión social. A través de nuestra herramienta Voz Ciudadana, recopilamos, analizamos y canalizamos tus reportes hacia soluciones reales para nuestros barrios.',
  items = PROPUESTAS,
  tone = 'muted',
}: PropuestasSectionProps = {}) {
  const [active, setActive] = useState<Propuesta | null>(null);

  const featured = items.filter((p) => p.featured);
  const rest = items.filter((p) => !p.featured);

  const handleOpen = (p: Propuesta) => setActive(p);
  const handleClose = () => setActive(null);

  return (
    <section
      id={id}
      className={['py-24 px-6 scroll-mt-20', tone === 'white' ? 'bg-white' : 'bg-muted'].join(' ')}
    >
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <span className="text-primary text-sm font-bold uppercase tracking-widest mb-3 block">
            {eyebrow}
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-foreground text-balance">{title}</h2>
          <p className="text-muted-foreground mt-4 max-w-xl mx-auto leading-relaxed">
            {description}
          </p>
        </motion.div>

        {featured.length > 0 ? (
          <div className="grid sm:grid-cols-3 gap-6 mb-6">
            {featured.map((p, i) => (
              <PropuestaCard
                key={p.title}
                propuesta={p}
                featured
                delay={i * 0.1}
                onOpen={handleOpen}
              />
            ))}
          </div>
        ) : null}

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {rest.map((p, i) => (
            <PropuestaCard key={p.title} propuesta={p} delay={i * 0.06} onOpen={handleOpen} />
          ))}
        </div>
      </div>

      {/* Modal */}
      {active && <PropuestaModal propuesta={active} onClose={handleClose} />}
    </section>
  );
}
