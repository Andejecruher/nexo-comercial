import {
  BRAND_BUBBLE_PATH,
  BRAND_FIGURE_PATH,
  BRAND_VIEW_BOX,
} from '@/components/shared/brand/logo-paths.generated';
import { cn } from '@/lib/shared/utils';

export const BRAND_NAME = 'Nexo Comercial';
export const BRAND_TAGLINE = 'Canales y operación';
/** Guinda Morena, matches --primary in globals.css. */
export const BRAND_COLOR = '#711B2C';
export const BRAND_ON_COLOR = '#FFFFFF';

export type BrandLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Square utilities so the mark never stretches, whatever the flex context. */
const SIZE_CLASS: Record<BrandLogoSize, string> = {
  xs: 'size-4', // 16px
  sm: 'size-6', // 24px
  md: 'size-8', // 32px
  lg: 'size-10', // 40px
  xl: 'size-12', // 48px
  '2xl': 'size-16', // 64px
};

export interface BrandLogoProps {
  /** Preset square size. Ignored when `className` sets explicit dimensions. */
  size?: BrandLogoSize;
  /** `onLight` = guinda bubble; `onDark` = inverted for guinda/dark surfaces. */
  variant?: 'onLight' | 'onDark';
  /**
   * Accessible name. Pass `''` for decorative use, i.e. when adjacent visible
   * text already conveys the brand.
   */
  label?: string;
  className?: string;
}

/**
 * The Nexo Comercial mark, inlined as vector so it inherits the current
 * colour scheme and costs no extra request. Geometry is generated from
 * components/shared/brand/logo-icon.svg.
 */
export function BrandLogo({
  size = 'md',
  variant = 'onLight',
  label = BRAND_NAME,
  className,
}: BrandLogoProps) {
  const inverted = variant === 'onDark';
  const bubbleFill = inverted ? BRAND_ON_COLOR : BRAND_COLOR;
  const figureFill = inverted ? BRAND_COLOR : BRAND_ON_COLOR;
  const decorative = label === '';

  return (
    <svg
      viewBox={BRAND_VIEW_BOX}
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', SIZE_CLASS[size], className)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      <path fill={bubbleFill} d={BRAND_BUBBLE_PATH} />
      <path fill={figureFill} d={BRAND_FIGURE_PATH} />
    </svg>
  );
}

export interface BrandLockupProps extends Omit<BrandLogoProps, 'label'> {
  /** Render the platform tagline under the brand name. */
  showTagline?: boolean;
}

/**
 * Horizontal lockup: mark plus wordmark. The mark is decorative here because
 * the brand name is already rendered as text.
 */
export function BrandLockup({
  size = 'lg',
  variant = 'onLight',
  showTagline = true,
  className,
}: BrandLockupProps) {
  const inverted = variant === 'onDark';

  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BrandLogo size={size} variant={variant} label="" />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-black text-[18px] tracking-tight',
            inverted ? 'text-white' : 'text-primary',
          )}
        >
          {BRAND_NAME}
        </span>
        {showTagline ? (
          <span
            className={cn(
              'mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.18em]',
              inverted ? 'text-white/80' : 'text-secondary',
            )}
          >
            {BRAND_TAGLINE}
          </span>
        ) : null}
      </span>
    </span>
  );
}
