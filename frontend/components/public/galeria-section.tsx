'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export type GalleryItem = {
  id: string;
  src: string;
  caption: string;
  aspect: string;
};

const GALLERY_ITEMS: GalleryItem[] = [
  {
    id: 'g1',
    src: '/images/galeria-1.jpg',
    caption: 'Asamblea comunitaria en el Parque Central de Cintalapa',
    aspect: 'aspect-[4/3]',
  },
  {
    id: 'g2',
    src: '/images/galeria-2.jpg',
    caption: 'Entrega de apoyos a familias del Barrio La Candelaria',
    aspect: 'aspect-[3/4]',
  },
  {
    id: 'g3',
    src: '/images/galeria-3.jpg',
    caption: 'Reunión con mujeres líderes de Cintalapa',
    aspect: 'aspect-[4/3]',
  },
  {
    id: 'g4',
    src: '/images/galeria-4.jpg',
    caption: 'Recorrido por los campos de Cintalapa de Figueroa',
    aspect: 'aspect-square',
  },
  {
    id: 'g5',
    src: '/images/galeria-5.jpg',
    caption: 'Foro de salud comunitaria en Santo Domingo',
    aspect: 'aspect-[4/3]',
  },
  {
    id: 'g6',
    src: '/images/galeria-1.jpg',
    caption: 'Brigada de limpieza en el Barrio de Guadalupe',
    aspect: 'aspect-[3/4]',
  },
  {
    id: 'g7',
    src: '/images/galeria-2.jpg',
    caption: 'Taller de emprendimiento para mujeres, Colonia Ejidal',
    aspect: 'aspect-square',
  },
  {
    id: 'g8',
    src: '/images/galeria-3.jpg',
    caption: 'Reunión con mujeres líderes de Cintalapa',
    aspect: 'aspect-[4/3]',
  },
  {
    id: 'g9',
    src: '/images/galeria-4.jpg',
    caption: 'Recorrido por los campos de Cintalapa de Figueroa',
    aspect: 'aspect-square',
  },
  {
    id: 'g10',
    src: '/images/galeria-5.jpg',
    caption: 'Foro de salud comunitaria en Santo Domingo',
    aspect: 'aspect-[4/3]',
  },
];

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------

interface LightboxProps {
  items: GalleryItem[];
  index: number;
  onClose: () => void;
  onNav: (index: number) => void;
}

function GaleriaLightbox({ items, index, onClose, onNav }: LightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = items[index];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNav((index - 1 + items.length) % items.length);
      if (e.key === 'ArrowRight') onNav((index + 1) % items.length);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onNav, index, items.length]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Imagen: ${item.caption}`}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-foreground/45 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Content */}
      <motion.div
        key={item.id}
        className="relative z-10 flex flex-col items-center max-w-4xl w-full"
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.88 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        {/* Close */}
        <button
          ref={closeRef}
          onClick={onClose}
          className="absolute -top-12 right-0 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Cerrar galería"
        >
          <X size={24} />
        </button>

        {/* Image */}
        <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl bg-sidebar">
          <Image
            src={item.src}
            alt={item.caption}
            width={1600}
            height={1200}
            sizes="100vw"
            className="w-full max-h-[75vh] object-contain"
          />

          {/* Nav arrows */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNav((index - 1 + items.length) % items.length);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-sidebar/60 text-white hover:bg-sidebar transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Imagen anterior"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNav((index + 1) % items.length);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-sidebar/60 text-white hover:bg-sidebar transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Siguiente imagen"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Caption */}
        <div className="mt-4 text-center px-4">
          <p className="text-white font-semibold text-sm leading-relaxed">{item.caption}</p>
          <p className="text-white/50 text-xs mt-1">
            {index + 1} / {items.length} · Nexo Comercial · Cintalapa de Figueroa
          </p>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Visibility constants
// ---------------------------------------------------------------------------

const VISIBLE_LIMIT = 8;

// ---------------------------------------------------------------------------
// Mobile / tablet horizontal strip
// ---------------------------------------------------------------------------

const STRIP_GAP = 16;

function GaleriaStrip({ items, onOpen }: { items: GalleryItem[]; onOpen: (i: number) => void }) {
  const prefersReduced = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const halfWidthRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const posRef = useRef(0);

  useEffect(() => {
    if (prefersReduced) return;
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      const cards = Array.from(track.children) as HTMLElement[];
      const half = cards.length / 2;
      if (half < 1) return;
      let w = 0;
      for (let i = 0; i < half; i++) w += cards[i].offsetWidth + STRIP_GAP;
      halfWidthRef.current = w;
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [prefersReduced]);

  useEffect(() => {
    if (prefersReduced) return;
    const speed = 0.45;
    const step = () => {
      const track = trackRef.current;
      if (!track || halfWidthRef.current === 0) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      posRef.current += speed;
      if (posRef.current >= halfWidthRef.current) posRef.current -= halfWidthRef.current;
      track.style.transform = `translateX(-${posRef.current}px)`;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [prefersReduced]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (prefersReduced) return;
      const isVerticalDominant = Math.abs(e.deltaY) > Math.abs(e.deltaX);
      if (!isVerticalDominant) return;
      const c = e.currentTarget;
      const atStart = c.scrollLeft === 0 && e.deltaY < 0;
      const atEnd = c.scrollLeft + c.clientWidth >= c.scrollWidth - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      c.scrollLeft += e.deltaY;
    },
    [prefersReduced],
  );

  const doubled = [...items, ...items];

  if (prefersReduced) {
    return (
      <div className="flex flex-wrap gap-4 justify-center">
        {items.map((item, i) => (
          <button
            key={item.id}
            onClick={() => onOpen(i)}
            className="rounded-xl overflow-hidden w-52 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
            aria-label={`Ver imagen: ${item.caption}`}
          >
            <div className="aspect-4/3 overflow-hidden relative">
              <Image
                src={item.src}
                alt={item.caption}
                fill
                sizes="208px"
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden touch-pan-x snap-x snap-mandatory"
      onWheel={handleWheel}
      aria-label="Carrusel de galería fotográfica"
    >
      <div
        ref={trackRef}
        className="flex w-max"
        style={{ gap: STRIP_GAP, willChange: 'transform' }}
        aria-hidden="true"
      >
        {doubled.map((item, i) => (
          <button
            key={`${item.id}-${i}`}
            onClick={() => onOpen(i % items.length)}
            className="snap-start rounded-xl overflow-hidden shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Ver imagen: ${item.caption}`}
          >
            <div className="aspect-4/3 h-52 overflow-hidden relative">
              <Image
                src={item.src}
                alt={item.caption}
                fill
                sizes="(max-width: 1024px) 80vw, 208px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-sidebar/0 group-hover:bg-sidebar/40 transition-all duration-300 flex items-end p-3">
                <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-300 line-clamp-2 text-left">
                  {item.caption}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop masonry grid
// ---------------------------------------------------------------------------

function GaleriaGrid({ items, onOpen }: { items: GalleryItem[]; onOpen: (i: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-4 auto-rows-[180px]">
      {items.map((item, i) => {
        const tall = i === 0 || i === 3;
        return (
          <motion.button
            key={item.id}
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.07 }}
            onClick={() => onOpen(i)}
            className={[
              'relative rounded-2xl overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tall ? 'row-span-2' : '',
              i === 0 ? 'col-span-2' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={`Ver imagen: ${item.caption}`}
          >
            <Image
              src={item.src}
              alt={item.caption}
              fill
              sizes="(min-width: 1280px) 28vw, (min-width: 1024px) 33vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-sidebar/0 group-hover:bg-sidebar/50 transition-all duration-300 flex items-end p-5">
              <span className="text-white text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-300 leading-tight text-left">
                {item.caption}
              </span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export type GaleriaSectionProps = {
  id?: string;
  eyebrow?: string;
  title?: React.ReactNode;
  subtitle?: string;
  items?: GalleryItem[];
  tone?: 'light' | 'dark';
};

export function GaleriaSection({
  id = 'galeria',
  eyebrow = 'Galería',
  title = (
    <>
      El trabajo <span className="text-primary">en los barrios.</span>
    </>
  ),
  subtitle = 'Cada imagen es un testimonio de la presencia real y el compromiso con la gente de Cintalapa de Figueroa.',
  items = GALLERY_ITEMS,
  tone = 'light',
}: GaleriaSectionProps = {}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Show only the most recent VISIBLE_LIMIT images in the grid/strip.
  // The full list is always available for lightbox navigation.
  const allItems = items;
  const visibleItems = allItems.slice(0, VISIBLE_LIMIT);

  const handleOpen = useCallback((i: number) => setLightboxIndex(i), []);
  const handleClose = useCallback(() => setLightboxIndex(null), []);
  const handleNav = useCallback((i: number) => setLightboxIndex(i), []);

  const isDark = tone === 'dark';

  return (
    <section
      id={id}
      className={[
        'py-24 overflow-hidden scroll-mt-20',
        isDark ? 'border-t-4 border-accent-teal/50 bg-sidebar' : 'bg-white',
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
          <span
            className={[
              'text-sm font-bold uppercase tracking-widest mb-3 block',
              isDark ? 'text-accent-teal' : 'text-primary',
            ].join(' ')}
          >
            {eyebrow}
          </span>
          <h2
            className={[
              'text-4xl md:text-5xl font-black text-balance',
              isDark ? 'text-white' : 'text-foreground',
            ].join(' ')}
          >
            {title}
          </h2>
          <p
            className={[
              'mt-4 leading-relaxed',
              isDark ? 'text-white/70' : 'text-muted-foreground',
            ].join(' ')}
          >
            {subtitle}
          </p>
        </motion.div>
      </div>

      {/* Mobile / tablet: horizontal strip — only visible items */}
      <div className="px-6 lg:hidden">
        <GaleriaStrip items={visibleItems} onOpen={handleOpen} />
      </div>

      {/* Desktop: masonry grid — only visible items */}
      <div className="px-6 hidden lg:block max-w-7xl mx-auto">
        <GaleriaGrid items={visibleItems} onOpen={handleOpen} />
      </div>

      {/* Lightbox — always uses the full list so all images are navigable */}
      {lightboxIndex !== null && (
        <GaleriaLightbox
          items={allItems}
          index={lightboxIndex}
          onClose={handleClose}
          onNav={handleNav}
        />
      )}
    </section>
  );
}
