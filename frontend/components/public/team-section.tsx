'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { MapPin, Quote, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export type TestimonialItem = {
  id: string;
  name: string;
  location: string;
  img: string;
  short: string;
  full: string;
};

const TESTIMONIALS: TestimonialItem[] = [
  {
    id: 't1',
    name: 'María del Carmen Ruiz',
    location: 'Vecina del Barrio de la Candelaria',
    img: '/images/team-1.jpg',
    short:
      'Gracias al equipo KAB y su herramienta Voz Ciudadana, pudimos canalizar el reporte de nuestro barrio y gestionar la escritura de mi casa.',
    full: 'Gracias al equipo KAB y su herramienta Voz Ciudadana, pudimos canalizar el reporte de nuestro barrio y gestionar la escritura de mi casa que llevaba diez años en trámite. Por primera vez alguien llegó a preguntar cómo estamos, qué necesitamos. No sólo prometieron, llegaron y cumplieron. Eso no se olvida en un barrio como el nuestro donde siempre nos piden el voto y luego desaparecen.',
  },
  {
    id: 't2',
    name: 'Angélica Sánchez Torres',
    location: 'Colonia Ejidal, Cintalapa',
    img: '/images/team-2.jpg',
    short:
      'El taller de emprendimiento que organizaron nos cambió la vida a quince mujeres. Hoy tengo mi propio negocio de comida.',
    full: 'El taller de emprendimiento que organizaron nos cambió la vida a quince mujeres de la colonia. Hoy tengo mi propio negocio de comida y pago mis propias cuentas. Antes dependía de mi esposo para todo. Con una pequeña capacitación y el apoyo de la red, las cosas pueden cambiar de verdad.',
  },
  {
    id: 't3',
    name: 'Don Ernesto Pérez López',
    location: 'Barrio de Guadalupe, Cintalapa',
    img: '/images/team-3.jpg',
    short:
      'Gracias al equipo KAB y su herramienta Voz Ciudadana, pudimos canalizar el reporte de nuestro barrio y en dos semanas arreglaron el camino.',
    full: 'Llevaba tres años pidiendo la reparación del camino de terracería que conecta a veinte familias con la carretera principal y nadie me daba respuesta. Gracias al equipo KAB y su herramienta Voz Ciudadana, pudimos canalizar el reporte de nuestro barrio, lo escucharon y en dos semanas mandaron la maquinaria. Ahora nuestros hijos llegan bien a la escuela aunque llueva.',
  },
  {
    id: 't4',
    name: 'Sofía Morales Gutiérrez',
    location: 'Vecina del Centro Histórico',
    img: '/images/team-4.jpg',
    short:
      'En el dispensario comunitario atendieron a mi mamá sin cobrarle nada. El servicio fue digno y humano, algo que no esperaba.',
    full: 'En el dispensario comunitario que organizaron atendieron a mi mamá de 74 años sin cobrarle nada y con mucho respeto. El servicio fue digno y humano, con médicos que te escuchan, algo que honestamente no esperaba. Es la primera vez que siento que la salud pública puede funcionar bien en nuestra comunidad.',
  },
  {
    id: 't5',
    name: 'Luisa Hernández Ramos',
    location: 'Santo Domingo, Cintalapa',
    img: '/images/team-1.jpg',
    short:
      'Gracias al equipo KAB y su herramienta Voz Ciudadana, pudimos canalizar el reporte de nuestro barrio y gestionar la beca que salvó a mi hija.',
    full: 'Gracias al equipo KAB y su herramienta Voz Ciudadana, pudimos canalizar el reporte de nuestro barrio y gestionar la beca que salvó a mi hija de tener que dejar la preparatoria por la falta de dinero. Hoy está en su segundo año y quiere estudiar enfermería. Parece pequeño pero para nuestra familia fue todo. La gestión fue rápida y sin complicaciones, sin padrinos ni palancas, solo llenamos una solicitud.',
  },
  {
    id: 't6',
    name: 'Roberto Castellanos Díaz',
    location: 'Ejido La Concordia, Cintalapa',
    img: '/images/team-3.jpg',
    short:
      'Recuperamos el espacio deportivo del ejido con apoyo del programa. Ahora los jóvenes tienen dónde entrenar y convivir.',
    full: 'Recuperamos el espacio deportivo del ejido que estaba abandonado hace años, con apoyo del programa y trabajo colectivo de la gente. Ahora los jóvenes tienen dónde entrenar y convivir en lugar de andar en la calle. El cambio en el ambiente del ejido ha sido enorme y la gente lo valora mucho.',
  },
];

// ---------------------------------------------------------------------------
// Modal component
// ---------------------------------------------------------------------------

interface TestimonialModalProps {
  item: TestimonialItem;
  onClose: () => void;
}

function TestimonialModal({ item, onClose }: TestimonialModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Focus close button on mount
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-name"
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-foreground/45 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Card */}
      <motion.div
        className="relative z-10 bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 overflow-y-auto max-h-[90vh]"
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.88 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        {/* Close */}
        <button
          ref={closeRef}
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Cerrar testimonio"
        >
          <X size={20} />
        </button>

        {/* Quote icon */}
        <div className="mb-5 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Quote size={18} className="text-primary fill-primary/20" />
        </div>

        <p className="text-foreground text-base leading-relaxed mb-6 italic">
          &ldquo;{item.full}&rdquo;
        </p>

        <div className="flex items-center gap-3 pt-4 border-t border-border">
          <Image
            src={item.img}
            alt={item.name}
            width={48}
            height={48}
            sizes="48px"
            className="w-12 h-12 rounded-full object-cover border-2 border-primary/20"
          />
          <div>
            <p id="modal-name" className="font-black text-foreground text-sm leading-tight">
              {item.name}
            </p>
            <p className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5">
              <MapPin size={11} />
              {item.location}
            </p>
            <p className="text-primary/60 text-[10px] font-semibold uppercase tracking-wider mt-0.5">
              Voz Ciudadana · Cintalapa de Figueroa
            </p>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Carousel
// ---------------------------------------------------------------------------

const GAP = 24; // px — must match gap-6
const RESUME_DELAY = 1800; // ms after drag/wheel ends before autoplay resumes

interface CarouselProps {
  items: TestimonialItem[];
  modalOpen: boolean;
  onOpenCard: (item: TestimonialItem) => void;
}

function TestimonialsCarousel({ items, modalOpen, onOpenCard }: CarouselProps) {
  const prefersReduced = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const halfWidthRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const posRef = useRef(0);

  // Drag state
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartPosRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);

  // Measure half-width with ResizeObserver
  useEffect(() => {
    if (prefersReduced) return;
    const track = trackRef.current;
    if (!track) return;

    const observe = () => {
      const cards = Array.from(track.children) as HTMLElement[];
      const half = cards.length / 2;
      if (half < 1) return;
      let w = 0;
      for (let i = 0; i < half; i++) {
        w += cards[i].offsetWidth + GAP;
      }
      halfWidthRef.current = w;
    };

    observe();
    const ro = new ResizeObserver(observe);
    ro.observe(track);
    return () => ro.disconnect();
  }, [prefersReduced]);

  // Clamp position to seamless loop range
  const clampPos = useCallback(() => {
    const half = halfWidthRef.current;
    if (half === 0) return;
    posRef.current = ((posRef.current % half) + half) % half;
  }, []);

  // Apply current posRef to DOM
  const applyPos = useCallback(() => {
    const track = trackRef.current;
    if (track) track.style.transform = `translateX(-${posRef.current}px)`;
  }, []);

  // Autoplay RAF loop
  const startRAF = useCallback(() => {
    if (rafRef.current !== null) return;
    const speed = 0.6;

    const step = () => {
      if (!pausedRef.current && halfWidthRef.current > 0) {
        posRef.current += speed;
        clampPos();
        applyPos();
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [clampPos, applyPos]);

  const stopRAF = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Pause autoplay temporarily (drag / wheel), resume after delay
  const pauseAutoplay = useCallback(() => {
    pausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      pausedRef.current = false;
    }, RESUME_DELAY);
  }, []);

  // Start / stop based on reduced motion and modal state
  useEffect(() => {
    if (prefersReduced || modalOpen) {
      stopRAF();
    } else {
      startRAF();
    }
    return stopRAF;
  }, [prefersReduced, modalOpen, startRAF, stopRAF]);

  // Cleanup resume timer on unmount
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  // ---- Mouse drag handlers ----
  // Track whether the drag distance exceeded the click threshold
  const dragMovedRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (prefersReduced) return;
      isDraggingRef.current = true;
      dragMovedRef.current = false;
      setIsDragging(true);
      dragStartXRef.current = e.clientX;
      dragStartPosRef.current = posRef.current;
      pauseAutoplay();
      e.preventDefault();
    },
    [prefersReduced, pauseAutoplay],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || prefersReduced) return;
      const delta = dragStartXRef.current - e.clientX;
      if (Math.abs(delta) > 4) dragMovedRef.current = true;
      posRef.current = dragStartPosRef.current + delta;
      clampPos();
      applyPos();
    },
    [prefersReduced, clampPos, applyPos],
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  // ---- Wheel handler ----
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (prefersReduced) return;
      // Use whichever axis has more movement
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      e.preventDefault();
      pauseAutoplay();
      posRef.current += delta * 0.8;
      clampPos();
      applyPos();
    },
    [prefersReduced, pauseAutoplay, clampPos, applyPos],
  );

  if (prefersReduced) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
        {items.map((item) => (
          <TestimonialCard key={item.id} item={item} onOpen={onOpenCard} />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="overflow-hidden select-none touch-pan-x"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      aria-label="Carrusel de testimonios ciudadanos"
    >
      <div
        ref={trackRef}
        className="flex gap-6 w-max py-4"
        style={{ willChange: 'transform' }}
        aria-hidden="true"
      >
        {/* Two sets for seamless loop */}
        {[...items, ...items].map((item, i) => (
          <TestimonialCard
            key={`${item.id}-${i}`}
            item={item}
            onOpen={onOpenCard}
            dragMovedRef={dragMovedRef}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single testimonial card
// ---------------------------------------------------------------------------

interface CardProps {
  item: TestimonialItem;
  onOpen: (item: TestimonialItem) => void;
  dragMovedRef?: React.RefObject<boolean>;
}

function TestimonialCard({ item, onOpen, dragMovedRef }: CardProps) {
  const handleClick = () => {
    if (dragMovedRef?.current) return;
    onOpen(item);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={[
        'group text-left bg-white border border-primary/20 rounded-2xl shadow-sm',
        'hover:shadow-md hover:border-primary/40 transition-all duration-300',
        'flex flex-col w-72 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Header */}
      <div className="relative">
        <div className="aspect-4/3 overflow-hidden rounded-t-2xl relative">
          <Image
            src={item.img}
            alt={item.name}
            fill
            sizes="288px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
        <div className="absolute top-3 left-3 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow">
          <Quote size={14} className="text-white fill-white/30" />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-5 gap-3">
        <p className="text-foreground text-sm leading-relaxed line-clamp-3 italic flex-1">
          &ldquo;{item.short}&rdquo;
        </p>
        <div className="border-t border-border pt-3">
          <p className="font-black text-foreground text-sm leading-tight">{item.name}</p>
          <p className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5">
            <MapPin size={11} />
            {item.location}
          </p>
          <p className="text-primary/60 text-[10px] font-semibold uppercase tracking-wider mt-1">
            Voz Ciudadana · Cintalapa de Figueroa
          </p>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export type TeamSectionProps = {
  id?: string;
  eyebrow?: string;
  title?: React.ReactNode;
  description?: string;
  items?: TestimonialItem[];
  tone?: 'muted' | 'white';
};

export function TeamSection({
  id = 'voces',
  eyebrow = 'Voces de Cintalapa',
  title = (
    <>
      Testimonios de <span className="text-primary">nuestra gente</span>
    </>
  ),
  description = 'Los testimonios de quienes viven el trabajo de gestión en los barrios y colonias de Cintalapa de Figueroa son la mejor prueba de lo que hacemos.',
  items = TESTIMONIALS,
  tone = 'muted',
}: TeamSectionProps = {}) {
  const [activeItem, setActiveItem] = useState<TestimonialItem | null>(null);

  const handleOpen = useCallback((item: TestimonialItem) => {
    setActiveItem(item);
  }, []);

  const handleClose = useCallback(() => {
    setActiveItem(null);
  }, []);

  return (
    <section
      id={id}
      className={[
        'py-24 overflow-hidden scroll-mt-20',
        tone === 'white' ? 'bg-white' : 'bg-muted',
      ].join(' ')}
    >
      {/* Header */}
      <div className="px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14 max-w-2xl mx-auto"
        >
          <span className="text-primary text-sm font-bold uppercase tracking-widest mb-3 block">
            {eyebrow}
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-foreground text-balance">{title}</h2>
          <p className="text-muted-foreground mt-4 leading-relaxed">{description}</p>
        </motion.div>
      </div>

      {/* Carousel — full bleed */}
      <div className="px-6">
        <TestimonialsCarousel
          items={items}
          modalOpen={activeItem !== null}
          onOpenCard={handleOpen}
        />
      </div>

      {/* Modal */}
      {activeItem && <TestimonialModal item={activeItem} onClose={handleClose} />}
    </section>
  );
}
