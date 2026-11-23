export type CoverageTier = 'none' | 'low' | 'medium' | 'high';

export function coverageTier(pct: number | null | undefined): CoverageTier {
  if (pct === null || pct === undefined) return 'none';
  if (pct >= 66) return 'high';
  if (pct >= 33) return 'medium';
  return 'low';
}

export function coverageTierStyle(tier: CoverageTier): {
  label: string;
  dot: string;
  text: string;
  bar: string;
} {
  if (tier === 'high') {
    return {
      label: 'Alto',
      dot: 'bg-green-500',
      text: 'text-green-700',
      bar: '[&>div]:bg-green-600',
    };
  }
  if (tier === 'medium') {
    return {
      label: 'Medio',
      dot: 'bg-amber-500',
      text: 'text-amber-700',
      bar: '[&>div]:bg-amber-500',
    };
  }
  if (tier === 'low') {
    return {
      label: 'Bajo',
      dot: 'bg-red-500',
      text: 'text-red-700',
      bar: '[&>div]:bg-red-500',
    };
  }
  return {
    label: 'Sin meta',
    dot: 'bg-muted-foreground/40',
    text: 'text-muted-foreground',
    bar: '[&>div]:bg-muted-foreground/40',
  };
}

export function formatCoveragePct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return 'Sin meta';
  return `${Math.round(pct)}%`;
}

export function topN<T extends { total: number }>(items: T[], n: number): T[] {
  return [...items].sort((a, b) => b.total - a.total).slice(0, n);
}
