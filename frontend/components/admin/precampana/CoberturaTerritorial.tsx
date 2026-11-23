'use client';

import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  CoordinatorMetrics,
  LeaderMetrics,
  PrecampanaDashboardMetrics,
  SectionMetrics,
} from '@/lib/precampana-api';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import { coverageTier, coverageTierStyle, formatCoveragePct, topN } from './coverage-utils';

type TerritoryTab = 'heat' | 'seccion' | 'barrio' | 'coordinador' | 'lider';
const CHART_TOP_N = 10;

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="h-55 flex items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function TerritoryBarChart({ data }: { data: Array<Record<string, string | number | null>> }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barSize={24}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<TerritoryTooltip />} />
        <Bar dataKey="total" fill="var(--color-primary)" radius={[6, 6, 0, 0]} name="Registros" />
      </BarChart>
    </ResponsiveContainer>
  );
}

type ChartTooltipPayload = NonNullable<TooltipProps<number, string>['payload']>;

function TerritoryTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string> & { extra?: Record<string, string> }) {
  if (!active || !payload?.length) return null;
  const extra = (payload[0]?.payload ?? {}) as Record<string, unknown>;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-2.5 shadow-lg text-sm max-w-64 wrap-anywhere">
      <p className="font-semibold text-foreground mb-1">{String(label)}</p>
      {(payload as ChartTooltipPayload).map((item) => (
        <p key={String(item.dataKey)} style={{ color: item.color }}>
          {item.name ?? item.dataKey}: <strong>{item.value}</strong>
        </p>
      ))}
      {typeof extra.target === 'number' && (
        <p className="text-muted-foreground">
          Meta: <strong>{extra.target.toLocaleString('es-MX')}</strong>
        </p>
      )}
      {typeof extra.pollingStationCount === 'number' && (
        <p className="text-muted-foreground">Casillas: {extra.pollingStationCount}</p>
      )}
      {typeof extra.votesPerStation === 'number' && (
        <p className="text-muted-foreground">Votos/casilla: {extra.votesPerStation}</p>
      )}
      {typeof extra.nominalList === 'number' && (
        <p className="text-muted-foreground">Lista nominal: {extra.nominalList}</p>
      )}
      {typeof extra.votesRequired === 'number' && (
        <p className="text-muted-foreground">Votos necesarios: {extra.votesRequired}</p>
      )}
    </div>
  );
}

function CoverageCell({ pct }: { pct: number | null }) {
  const style = coverageTierStyle(coverageTier(pct));
  if (pct === null) {
    return <span className="text-xs text-muted-foreground">Sin meta</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className={cn('h-2 w-20 bg-muted', style.bar)} />
      <span className={cn('text-xs font-semibold', style.text)}>{formatCoveragePct(pct)}</span>
    </div>
  );
}

function SectionSummaryTable({ sections }: { sections: SectionMetrics[] }) {
  return (
    <div
      className="min-w-0 max-w-full overflow-auto max-h-75"
      role="region"
      aria-label="Resumen por sección"
      tabIndex={0}
    >
      <table className="w-full min-w-160 text-sm wrap-normal">
        <thead className="sticky top-0 bg-card">
          <tr className="text-xs text-muted-foreground uppercase tracking-wider">
            <th className="text-left font-semibold py-2 pr-2">Sección</th>
            <th className="text-right font-semibold py-2 pr-2">Promovidos</th>
            <th className="text-right font-semibold py-2 pr-2">Meta</th>
            <th className="text-right font-semibold py-2 pr-2">Casillas</th>
            <th className="text-right font-semibold py-2 pr-2">Votos/casilla</th>
            <th className="text-right font-semibold py-2 pr-2">Lista nominal</th>
            <th className="text-right font-semibold py-2 pr-2">Votos nec.</th>
            <th className="text-left font-semibold py-2 pl-2">Avance</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => {
            const style = coverageTierStyle(coverageTier(section.coveragePct));
            return (
              <tr key={section.sectionId} className="border-b border-border last:border-0">
                <td className="py-2 pr-2 font-semibold text-foreground">{section.sectionCode}</td>
                <td className="py-2 pr-2 text-right text-foreground">
                  {section.total.toLocaleString('es-MX')}
                </td>
                <td className="py-2 pr-2 text-right text-muted-foreground">
                  {section.target !== null ? section.target.toLocaleString('es-MX') : 'Sin meta'}
                </td>
                <td className="py-2 pr-2 text-right text-muted-foreground">
                  {section.pollingStationCount ?? '—'}
                </td>
                <td className="py-2 pr-2 text-right text-muted-foreground">
                  {section.votesPerStation ?? '—'}
                </td>
                <td className="py-2 pr-2 text-right text-muted-foreground">
                  {section.nominalList ?? '—'}
                </td>
                <td className="py-2 pr-2 text-right text-muted-foreground">
                  {section.votesRequired ?? '—'}
                </td>
                <td className="py-2 pl-2">
                  <span
                    className={cn('flex items-center gap-1.5 text-xs font-semibold', style.text)}
                  >
                    <span className={cn('w-2.5 h-2.5 rounded-full', style.dot)} />
                    {style.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NeighborhoodTable({
  neighborhoods,
}: {
  neighborhoods: PrecampanaDashboardMetrics['byNeighborhood'];
}) {
  return (
    <div
      className="min-w-0 max-w-full overflow-auto max-h-75"
      role="region"
      aria-label="Registros por barrio"
      tabIndex={0}
    >
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="text-xs text-muted-foreground uppercase tracking-wider">
            <th className="text-left font-semibold py-2 pr-2">Barrio</th>
            <th className="text-right font-semibold py-2">Promovidos</th>
          </tr>
        </thead>
        <tbody>
          {neighborhoods.map((neighborhood) => (
            <tr
              key={neighborhood.neighborhood || 'sin-barrio'}
              className="border-b border-border last:border-0"
            >
              <td className="py-2 pr-2 text-foreground">
                {neighborhood.neighborhood || 'Sin barrio'}
              </td>
              <td className="py-2 text-right text-foreground">
                {neighborhood.total.toLocaleString('es-MX')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoordinatorTable({ coordinators }: { coordinators: CoordinatorMetrics[] }) {
  return (
    <div
      className="min-w-0 max-w-full overflow-auto max-h-75"
      role="region"
      aria-label="Registros por coordinador"
      tabIndex={0}
    >
      <table className="w-full min-w-160 text-sm wrap-normal">
        <thead className="sticky top-0 bg-card">
          <tr className="text-xs text-muted-foreground uppercase tracking-wider">
            <th className="text-left font-semibold py-2 pr-2">Coordinador</th>
            <th className="text-left font-semibold py-2 pr-2">Sección</th>
            <th className="text-right font-semibold py-2 pr-2">Promovidos</th>
            <th className="text-right font-semibold py-2 pr-2">Meta</th>
            <th className="text-left font-semibold py-2">Avance</th>
          </tr>
        </thead>
        <tbody>
          {coordinators.map((coordinator) => (
            <tr key={coordinator.coordinatorId} className="border-b border-border last:border-0">
              <td className="py-2 pr-2 text-foreground">{coordinator.coordinatorName}</td>
              <td className="py-2 pr-2 text-muted-foreground">{coordinator.sectionCode}</td>
              <td className="py-2 pr-2 text-right text-foreground">
                {coordinator.total.toLocaleString('es-MX')}
              </td>
              <td className="py-2 pr-2 text-right text-muted-foreground">
                {coordinator.target !== null
                  ? coordinator.target.toLocaleString('es-MX')
                  : 'Sin meta'}
              </td>
              <td className="py-2">
                <CoverageCell pct={coordinator.coveragePct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaderTable({ leaders }: { leaders: LeaderMetrics[] }) {
  return (
    <div
      className="min-w-0 max-w-full overflow-auto max-h-75"
      role="region"
      aria-label="Registros por líder"
      tabIndex={0}
    >
      <table className="w-full min-w-160 text-sm wrap-normal">
        <thead className="sticky top-0 bg-card">
          <tr className="text-xs text-muted-foreground uppercase tracking-wider">
            <th className="text-left font-semibold py-2 pr-2">Líder</th>
            <th className="text-left font-semibold py-2 pr-2">Coordinador</th>
            <th className="text-right font-semibold py-2 pr-2">Promovidos</th>
            <th className="text-right font-semibold py-2 pr-2">Cuota</th>
            <th className="text-left font-semibold py-2">Avance</th>
          </tr>
        </thead>
        <tbody>
          {leaders.map((leader) => (
            <tr key={leader.leaderId} className="border-b border-border last:border-0">
              <td className="py-2 pr-2 text-foreground">{leader.leaderName || 'Sin líder'}</td>
              <td className="py-2 pr-2 text-muted-foreground">{leader.coordinatorName}</td>
              <td className="py-2 pr-2 text-right text-foreground">
                {leader.total.toLocaleString('es-MX')}
              </td>
              <td className="py-2 pr-2 text-right text-muted-foreground">
                {leader.target !== null ? leader.target.toLocaleString('es-MX') : 'Sin cuota'}
              </td>
              <td className="py-2">
                <CoverageCell pct={leader.coveragePct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CoberturaTerritorial({ metrics }: { metrics: PrecampanaDashboardMetrics }) {
  const [territoryTab, setTerritoryTab] = useState<TerritoryTab>('heat');

  const sectionChartData = useMemo(
    () =>
      topN(metrics.bySection, CHART_TOP_N).map((section) => ({
        label: section.sectionCode,
        total: section.total,
        target: section.target,
        pollingStationCount: section.pollingStationCount,
        votesPerStation: section.votesPerStation,
        nominalList: section.nominalList,
        votesRequired: section.votesRequired,
      })),
    [metrics.bySection],
  );

  const neighborhoodChartData = useMemo(
    () =>
      topN(metrics.byNeighborhood, CHART_TOP_N).map((neighborhood) => ({
        label: neighborhood.neighborhood || 'Sin barrio',
        total: neighborhood.total,
      })),
    [metrics.byNeighborhood],
  );

  const coordinatorChartData = useMemo(
    () =>
      topN(metrics.byCoordinator, CHART_TOP_N).map((coordinator) => ({
        label: coordinator.coordinatorName,
        total: coordinator.total,
        target: coordinator.target,
        votesRequired: coordinator.votesRequired,
      })),
    [metrics.byCoordinator],
  );

  const leaderChartData = useMemo(
    () =>
      topN(metrics.byLeader, CHART_TOP_N).map((leader) => ({
        label: leader.leaderName || 'Sin líder',
        total: leader.total,
        target: leader.target,
      })),
    [metrics.byLeader],
  );

  const totalTerritory = useMemo(() => {
    if (territoryTab === 'barrio') {
      return metrics.byNeighborhood.reduce((sum, item) => sum + item.total, 0);
    }
    if (territoryTab === 'lider') {
      return metrics.byLeader.reduce((sum, item) => sum + item.total, 0);
    }
    if (territoryTab === 'coordinador') {
      return metrics.byCoordinator.reduce((sum, item) => sum + item.total, 0);
    }
    return metrics.bySection.reduce((sum, item) => sum + item.total, 0);
  }, [
    territoryTab,
    metrics.byNeighborhood,
    metrics.byLeader,
    metrics.byCoordinator,
    metrics.bySection,
  ]);

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-black text-foreground text-sm">Cobertura Territorial Integral</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cintalapa de Figueroa · {totalTerritory.toLocaleString('es-MX')} registros
          </p>
        </div>
      </div>

      <Tabs
        className="min-w-0"
        value={territoryTab}
        onValueChange={(value) => setTerritoryTab(value as TerritoryTab)}
      >
        <TabsList className="mb-3 h-auto max-w-full flex-wrap *:h-auto">
          <TabsTrigger value="heat">Resumen</TabsTrigger>
          <TabsTrigger value="seccion">Sección</TabsTrigger>
          <TabsTrigger value="barrio">Barrio</TabsTrigger>
          <TabsTrigger value="coordinador">Coordinador</TabsTrigger>
          <TabsTrigger value="lider">Líder</TabsTrigger>
        </TabsList>

        <TabsContent value="heat">
          {metrics.bySection.length === 0 ? (
            <ChartEmpty message="Sin secciones activas todavía." />
          ) : (
            <SectionSummaryTable sections={metrics.bySection} />
          )}
        </TabsContent>

        <TabsContent value="seccion">
          {metrics.bySection.length === 0 ? (
            <ChartEmpty message="Sin secciones activas todavía." />
          ) : (
            <div className="space-y-4">
              <TerritoryBarChart data={sectionChartData} />
              <SectionSummaryTable sections={metrics.bySection} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="barrio">
          {metrics.byNeighborhood.length === 0 ? (
            <ChartEmpty message="Sin registros por barrio todavía." />
          ) : (
            <div className="space-y-4">
              <TerritoryBarChart data={neighborhoodChartData} />
              <NeighborhoodTable neighborhoods={metrics.byNeighborhood} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="coordinador">
          {metrics.byCoordinator.length === 0 ? (
            <ChartEmpty message="Sin coordinadores activos todavía." />
          ) : (
            <div className="space-y-4">
              <TerritoryBarChart data={coordinatorChartData} />
              <CoordinatorTable coordinators={metrics.byCoordinator} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="lider">
          {metrics.byLeader.length === 0 ? (
            <ChartEmpty message="Sin líderes activos todavía." />
          ) : (
            <div className="space-y-4">
              <TerritoryBarChart data={leaderChartData} />
              <LeaderTable leaders={metrics.byLeader} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
