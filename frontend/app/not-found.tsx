'use client';

import { BrandLogo } from '@/components/brand/brand-logo';
import { useAuth } from '@/hooks/useAuth';
import { Eye, MapPin, Megaphone, Search } from 'lucide-react';
import Link from 'next/link';

const AUTHENTICATED_LINKS = [
  { href: '/admin/indicadores/precampana', label: 'Indicadores de precampaña' },
  { href: '/admin/indicadores/atencion', label: 'Indicadores de atención' },
  { href: '/admin/configuracion', label: 'Configuración' },
] as const;

type NetworkNode = { x: number; y: number; glow?: boolean; r?: number };

const NETWORK_NODES: NetworkNode[] = [
  { x: 320, y: 198, glow: true, r: 5.5 },
  { x: 92, y: 86, glow: true, r: 3.4 },
  { x: 158, y: 40, r: 2.2 },
  { x: 226, y: 78, glow: true, r: 3.2 },
  { x: 318, y: 34, r: 2.4 },
  { x: 408, y: 48, glow: true, r: 3.5 },
  { x: 486, y: 28, r: 2 },
  { x: 556, y: 76, glow: true, r: 3.3 },
  { x: 602, y: 148, r: 2.2 },
  { x: 548, y: 208, glow: true, r: 3.4 },
  { x: 498, y: 276, r: 2.4 },
  { x: 410, y: 318, r: 2.1 },
  { x: 320, y: 308, glow: true, r: 3.6 },
  { x: 228, y: 322, r: 2.2 },
  { x: 142, y: 276, glow: true, r: 3.2 },
  { x: 68, y: 218, r: 2.3 },
  { x: 54, y: 148, r: 2 },
  { x: 138, y: 148, glow: true, r: 3 },
  { x: 218, y: 168, r: 2.3 },
  { x: 258, y: 238, glow: true, r: 3.1 },
  { x: 382, y: 238, glow: true, r: 3.1 },
  { x: 422, y: 164, r: 2.3 },
  { x: 478, y: 126, glow: true, r: 3 },
  { x: 358, y: 126, r: 2.2 },
  { x: 278, y: 126, r: 2.2 },
  { x: 188, y: 218, r: 2.1 },
  { x: 458, y: 218, r: 2.1 },
  { x: 100, y: 318, r: 1.8 },
  { x: 590, y: 300, r: 1.8 },
];

const NETWORK_EDGES: Array<[number, number]> = [
  [0, 3],
  [0, 5],
  [0, 7],
  [0, 9],
  [0, 12],
  [0, 14],
  [0, 17],
  [0, 19],
  [0, 20],
  [0, 22],
  [0, 23],
  [0, 24],
  [1, 2],
  [1, 17],
  [1, 3],
  [2, 3],
  [3, 4],
  [3, 24],
  [4, 5],
  [5, 6],
  [5, 23],
  [6, 7],
  [7, 8],
  [7, 22],
  [8, 9],
  [9, 10],
  [9, 22],
  [10, 11],
  [11, 12],
  [12, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [16, 17],
  [17, 18],
  [18, 19],
  [19, 12],
  [20, 12],
  [20, 21],
  [21, 22],
  [23, 24],
  [18, 3],
  [21, 5],
  [25, 19],
  [26, 20],
  [14, 27],
  [10, 28],
];

const FLOATING_ICONS = [
  { id: 'megaphone', Icon: Megaphone, x: '13%', y: '36%' },
  { id: 'search', Icon: Search, x: '81%', y: '26%' },
  { id: 'pin', Icon: MapPin, x: '46%', y: '86%' },
  { id: 'eye', Icon: Eye, x: '79%', y: '70%' },
] as const;

function SiteNetworkBackdrop() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full text-slate-300"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="not-found-site-nodes" width="220" height="190" patternUnits="userSpaceOnUse">
          <circle cx="18" cy="28" r="1.35" fill="currentColor" opacity="0.55" />
          <circle cx="86" cy="16" r="1.1" fill="currentColor" opacity="0.4" />
          <circle cx="148" cy="42" r="1.4" fill="currentColor" opacity="0.5" />
          <circle cx="198" cy="88" r="1.15" fill="currentColor" opacity="0.45" />
          <circle cx="64" cy="96" r="1.3" fill="currentColor" opacity="0.5" />
          <circle cx="122" cy="128" r="1.1" fill="currentColor" opacity="0.4" />
          <circle cx="28" cy="158" r="1.2" fill="currentColor" opacity="0.45" />
          <circle cx="176" cy="162" r="1.35" fill="currentColor" opacity="0.5" />
          <circle cx="210" cy="24" r="1" fill="currentColor" opacity="0.35" />
          <line
            x1="18"
            y1="28"
            x2="86"
            y2="16"
            stroke="currentColor"
            strokeWidth="0.6"
            opacity="0.35"
          />
          <line
            x1="86"
            y1="16"
            x2="148"
            y2="42"
            stroke="currentColor"
            strokeWidth="0.6"
            opacity="0.3"
          />
          <line
            x1="148"
            y1="42"
            x2="198"
            y2="88"
            stroke="currentColor"
            strokeWidth="0.6"
            opacity="0.3"
          />
          <line
            x1="18"
            y1="28"
            x2="64"
            y2="96"
            stroke="currentColor"
            strokeWidth="0.6"
            opacity="0.28"
          />
          <line
            x1="64"
            y1="96"
            x2="122"
            y2="128"
            stroke="currentColor"
            strokeWidth="0.6"
            opacity="0.32"
          />
          <line
            x1="122"
            y1="128"
            x2="176"
            y2="162"
            stroke="currentColor"
            strokeWidth="0.6"
            opacity="0.28"
          />
          <line
            x1="64"
            y1="96"
            x2="28"
            y2="158"
            stroke="currentColor"
            strokeWidth="0.6"
            opacity="0.25"
          />
          <line
            x1="148"
            y1="42"
            x2="122"
            y2="128"
            stroke="currentColor"
            strokeWidth="0.6"
            opacity="0.22"
          />
          <line
            x1="198"
            y1="88"
            x2="176"
            y2="162"
            stroke="currentColor"
            strokeWidth="0.6"
            opacity="0.25"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#not-found-site-nodes)" />
    </svg>
  );
}

function LostIllustration() {
  return (
    <div
      aria-label="Ilustración de una red ciudadana con la ruta 404 fragmentada"
      role="img"
      className="relative mx-auto h-56 w-full max-w-xl sm:h-72 lg:h-80"
    >
      <svg
        aria-hidden
        viewBox="0 0 640 340"
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="not-found-amber-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <mask id="not-found-crack-mask" maskUnits="userSpaceOnUse">
            <rect width="640" height="340" fill="white" />
            <polygon
              fill="black"
              points="168,18 186,58 162,64 184,118 168,122 148,66 174,58 154,16"
            />
            <polygon
              fill="black"
              points="312,12 334,62 304,68 328,124 310,128 288,70 320,62 298,10"
            />
            <polygon
              fill="black"
              points="452,16 470,54 448,60 466,122 450,126 430,62 458,54 438,14"
            />
            <polygon fill="black" points="236,70 258,78 232,92 248,108 228,112 214,88 240,78" />
          </mask>
        </defs>

        {NETWORK_EDGES.map(([from, to]) => {
          const a = NETWORK_NODES[from];
          const b = NETWORK_NODES[to];
          return (
            <line
              key={`${from}-${to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#9CA3AF"
              strokeWidth="1.15"
              opacity="0.55"
            />
          );
        })}

        {NETWORK_NODES.map((node, index) => (
          <g key={`${node.x}-${node.y}-${index}`}>
            {node.glow ? (
              <circle
                cx={node.x}
                cy={node.y}
                r={(node.r ?? 3) * 3.4}
                fill="#B8973A"
                opacity="0.28"
                filter="url(#not-found-amber-glow)"
                className="motion-safe:animate-pulse"
              />
            ) : null}
            <circle
              cx={node.x}
              cy={node.y}
              r={node.r ?? 2.2}
              fill={node.glow ? '#C4A24A' : '#6B7280'}
            />
          </g>
        ))}

        <text
          x="320"
          y="92"
          textAnchor="middle"
          fill="#711B2C"
          fontSize="108"
          fontWeight="900"
          letterSpacing="-10"
          fontFamily="var(--font-montserrat), Montserrat, ui-sans-serif, sans-serif"
          mask="url(#not-found-crack-mask)"
        >
          404
        </text>
        <polygon fill="#711B2C" points="178,56 190,60 176,78 166,74" opacity="0.85" />
        <polygon fill="#711B2C" points="326,58 340,64 322,84 312,76" opacity="0.8" />
        <polygon fill="#711B2C" points="458,52 470,58 456,74 446,68" opacity="0.85" />
      </svg>

      <div className="absolute left-1/2 top-[58%] z-10 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute inset-0 -m-4 rounded-full bg-accent/35 blur-xl" />
        <div className="relative flex size-16 items-center justify-center rounded-full bg-white/90 shadow-[0_8px_24px_rgba(113,27,44,0.16)] ring-1 ring-primary/15 sm:size-20">
          <BrandLogo size="xl" label="" className="sm:size-12" />
        </div>
      </div>

      {FLOATING_ICONS.map(({ id, Icon, x, y }, index) => (
        <div
          key={id}
          aria-hidden
          className="nf-float absolute z-10 rounded-lg border border-white/80 bg-white p-2 text-primary shadow-[0_6px_16px_rgba(17,24,39,0.1)]"
          style={{ left: x, top: y, animationDelay: `${index * 0.35}s` }}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.75} />
        </div>
      ))}
    </div>
  );
}

function RecoveryLinks() {
  const { isAuthenticated, status } = useAuth();
  const isLoggedIn = isAuthenticated || status === 'refreshing';
  const primaryHref = isLoggedIn ? '/admin' : '/';
  const primaryLabel = isLoggedIn ? 'Volver al panel principal' : 'Volver al inicio';

  if (status === 'loading') {
    return <div className="mt-6 h-11" aria-hidden />;
  }

  return (
    <>
      <Link
        href={primaryHref}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-8"
      >
        {primaryLabel}
      </Link>
      {isLoggedIn ? (
        <>
          <p className="mt-5 text-xs font-medium text-secondary sm:text-sm">
            O intenta una de estas opciones:
          </p>
          <nav
            aria-label="Opciones alternativas"
            className="mt-3 flex flex-wrap items-center justify-center gap-2"
          >
            {AUTHENTICATED_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-9 items-center justify-center rounded-full bg-[#e8eaee] px-4 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-[#dfe2e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </>
      ) : null}
    </>
  );
}

export default function NotFound() {
  return (
    <main className="relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-[#f3f4f6] px-4 py-6 font-sans text-foreground sm:px-6 sm:py-10 lg:px-10">
      <style>{`
        .nf-float {
          transform: translate(-50%, -50%);
        }
        @media (prefers-reduced-motion: no-preference) {
          .nf-float {
            animation: nf-float 4.5s ease-in-out infinite;
          }
        }
        @keyframes nf-float {
          0%, 100% { transform: translate(-50%, -50%) translateY(0); }
          50% { transform: translate(-50%, -50%) translateY(-5px); }
        }
      `}</style>
      <SiteNetworkBackdrop />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-144 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl"
      />

      <section
        aria-labelledby="not-found-title"
        className="relative mx-auto flex w-full max-w-3xl flex-col items-center rounded-3xl border border-white/70 bg-white/70 px-5 py-8 text-center shadow-[0_18px_50px_-24px_rgba(17,24,39,0.28)] backdrop-blur-xl sm:px-10 sm:py-10 lg:px-14 lg:py-12"
      >
        <Link
          href="/"
          className="mb-3 flex items-center gap-2.5 self-start rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <BrandLogo size="sm" label="" />
          <span className="text-sm font-medium tracking-wide text-primary">Voz ciudadana</span>
        </Link>

        <LostIllustration />

        <div className="mt-3 w-full max-w-xl sm:mt-5">
          <h1
            id="not-found-title"
            className="text-balance text-2xl font-extrabold tracking-tight text-primary sm:text-3xl lg:text-4xl"
          >
            Página no encontrada
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
            Lo sentimos, la página que buscas no existe o ha sido movida. Parece que te has perdido
            en la voz ciudadana.
          </p>
          <RecoveryLinks />
        </div>
      </section>
    </main>
  );
}
