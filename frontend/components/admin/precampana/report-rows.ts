import type { PrecampanaDashboardMetrics } from '@/lib/precampana-api';

export function buildPrecampanaReportRows(
  metrics: PrecampanaDashboardMetrics,
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  rows.push(['Indicadores — Precampaña (Promovidos)']);
  rows.push(['Cintalapa de Figueroa, Chiapas · Datos en tiempo real']);
  rows.push([]);
  rows.push(['Métrica', 'Valor']);
  rows.push(['Total Promovidos', metrics.total]);
  rows.push(['Días Activos', metrics.daysActive]);
  rows.push(['Líderes Activos', metrics.activeLeadersCount]);
  rows.push(['Líderes Cumplen Cuota', metrics.leadersMeetingQuota]);
  rows.push(['Líderes Sin Cuota', metrics.leadersWithoutQuota]);
  rows.push(['Efectividad de Líderes (%)', Math.round(metrics.leaderEffectivenessPct)]);
  rows.push(['Promovidos Verificados (INE)', metrics.verifiedPromovidos]);
  rows.push(['Calidad de Datos (%)', Math.round(metrics.dataQualityPct)]);
  rows.push(['Meta Resuelta — Alcance', metrics.resolvedGoal?.scope ?? 'MIXTO']);
  rows.push(['Meta Resuelta — Cadencia', metrics.resolvedGoal?.cadence ?? 'SIN_META']);
  rows.push([
    'Meta Resuelta — Fuente',
    metrics.resolvedGoal
      ? [metrics.resolvedGoal.resolutionSource, ...metrics.resolvedGoal.fallbackSources].join(' | ')
      : 'SIN_META',
  ]);
  rows.push(['Meta Resuelta — Target del período', metrics.resolvedGoal?.target ?? 0]);
  rows.push(['Meta Resuelta — Contexto', metrics.resolvedGoal?.contextLabel ?? 'Sin meta']);
  rows.push([
    'Meta Global (%)',
    metrics.globalGoal ? Math.round(metrics.globalGoal.progressPct) : 0,
  ]);
  rows.push(['Meta Global — Target', metrics.globalGoal?.target ?? 0]);
  rows.push([
    'Meta Semanal (%)',
    metrics.currentWeekGoal ? Math.round(metrics.currentWeekGoal.progressPct) : 0,
  ]);
  rows.push([]);
  rows.push(['Por Sección']);
  rows.push([
    'Sección',
    'Promovidos',
    'Meta',
    'Fuente',
    'Avance %',
    'Casillas',
    'Votos/casilla',
    'Lista nominal',
    'Votos necesarios',
  ]);
  metrics.bySection.forEach((section) =>
    rows.push([
      section.sectionCode,
      section.total,
      section.target ?? 'Sin meta',
      section.goalSource ?? 'SIN_META',
      section.coveragePct ?? 'Sin meta',
      section.pollingStationCount ?? '',
      section.votesPerStation ?? '',
      section.nominalList ?? '',
      section.votesRequired ?? '',
    ]),
  );
  rows.push([]);
  rows.push(['Por Barrio']);
  rows.push(['Barrio', 'Total']);
  metrics.byNeighborhood.forEach((neighborhood) =>
    rows.push([neighborhood.neighborhood || 'Sin barrio', neighborhood.total]),
  );
  rows.push([]);
  rows.push(['Por Coordinador']);
  rows.push(['Coordinador', 'Sección', 'Promovidos', 'Líderes', 'Meta', 'Fuente', 'Avance %']);
  metrics.byCoordinator.forEach((coordinator) =>
    rows.push([
      coordinator.coordinatorName,
      coordinator.sectionCode,
      coordinator.total,
      coordinator.leaderCount,
      coordinator.target ?? 'Sin meta',
      coordinator.goalSource ?? 'SIN_META',
      coordinator.coveragePct ?? 'Sin meta',
    ]),
  );
  rows.push([]);
  rows.push(['Por Líder']);
  rows.push(['Líder', 'Coordinador', 'Sección', 'Promovidos', 'Cuota', 'Avance %']);
  metrics.byLeader.forEach((leader) =>
    rows.push([
      leader.leaderName || 'Sin líder',
      leader.coordinatorName,
      leader.sectionCode,
      leader.total,
      leader.target ?? 'Sin cuota',
      leader.coveragePct ?? 'Sin meta',
    ]),
  );
  rows.push([]);
  rows.push(['Crecimiento Semanal']);
  rows.push(['Semana', 'Nuevos', 'Acumulado']);
  metrics.weeklyGrowth.forEach((week) => rows.push([week.weekLabel, week.total, week.cumulative]));
  return rows;
}
