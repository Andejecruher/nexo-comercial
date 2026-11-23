/**
 * DashboardViewPrecampana — tactical control dashboard for the precampaign
 * (Promovidos) phase. Pulls live metrics from the analytics API and degrades
 * gracefully to empty/zero states when the backend is unreachable or has no
 * goals configured yet.
 *
 * Sections:
 *   1. Empty metrics fallback + types
 *   2. Small presentational helpers (ChartEmpty, sparkline, histogram, tooltip)
 *   3. KPI cards
 *   4. Goals panel + manager dialog (preserved from previous implementation)
 *   5. CSV export helper
 *   6. Main component (header, filters, KPIs, charts, table, floating action)
 */

'use client';

import { CoberturaTerritorial } from '@/components/admin/precampana/CoberturaTerritorial';
import { CreateGoalModal } from '@/components/admin/precampana/CreateGoalModal';
import { PrecampanaFiltersBar } from '@/components/admin/precampana/PrecampanaFiltersBar';
import { buildPrecampanaReportRows } from '@/components/admin/precampana/report-rows';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePrecampanaDashboard } from '@/hooks/usePrecampanaDashboard';
import { precampanaApi, type PrecampanaGoal, type ResolvedGoalMetrics } from '@/lib/precampana-api';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileDown,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';

const CADENCE_LABELS = {
  CAMPAIGN: 'Campaña',
  MONTHLY: 'Mensual',
  WEEKLY: 'Semanal',
} as const;

function goalScopeLabel(goal: PrecampanaGoal): string {
  if (goal.scope === 'SECTION') return `Sección ${goal.section?.sectionCode ?? 'sin asignar'}`;
  if (goal.scope === 'LEADER') return goal.leader?.fullName ?? 'Líder sin asignar';
  return 'Todo el equipo';
}

// ─── 2. Small presentational helpers ─────────────────────────────────────────

type ChartTooltipPayload = NonNullable<TooltipProps<number, string>['payload']>;

const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-xl px-4 py-2.5 shadow-lg text-sm">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {(payload as ChartTooltipPayload).map((p) => (
          <p key={String(p.dataKey)} style={{ color: p.color }}>
            {p.name ?? p.dataKey}: <strong>{p.value}</strong>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="h-55 flex items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

/** Tiny sparkline using the last N weeklyGrowth totals. */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={30}>
      <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <XAxis dataKey="i" hide />
        <YAxis hide domain={['dataMin', 'dataMax']} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── 3. KPI cards ─────────────────────────────────────────────────────────────

type KpiCardProps = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  delay: number;
  children?: React.ReactNode;
};

function KpiCard({ label, value, icon: Icon, iconColor, delay, children }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="min-w-0 bg-card border border-border rounded-2xl p-4 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', iconColor)}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      <div>
        <div className="text-2xl font-black text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
      {children}
    </motion.div>
  );
}

function KpiSkeleton() {
  return (
    <div className="min-w-0 bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 animate-pulse">
      <div className="w-9 h-9 rounded-xl bg-muted" />
      <div className="space-y-2">
        <div className="h-7 w-20 rounded-md bg-muted" />
        <div className="h-3 w-28 max-w-full rounded-md bg-muted" />
      </div>
      <div className="h-2 w-full rounded-full bg-muted" />
    </div>
  );
}

// ─── 4. Goals panel + manager dialog ──────────────────────────────────────────

function GoalsListPanel({
  goals,
  loading,
  onEdit,
  onDeactivate,
}: {
  goals: PrecampanaGoal[];
  loading: boolean;
  onEdit: (goal: PrecampanaGoal) => void;
  onDeactivate: (goal: PrecampanaGoal) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (goals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Todavía no hay metas configuradas. Creá la primera con el botón &quot;Nueva meta&quot;.
      </p>
    );
  }

  return (
    <ScrollArea className="h-65 pr-2">
      <ul className="space-y-2">
        {goals.map((goal) => (
          <li
            key={goal.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">{goal.title}</span>
                <Badge variant="secondary" className="max-w-full whitespace-normal wrap-anywhere">
                  {CADENCE_LABELS[goal.cadence]} · {goalScopeLabel(goal)}
                </Badge>
                {!goal.isActive && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Inactiva
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                Meta: {goal.target.toLocaleString('es-MX')} ·{' '}
                {new Date(goal.startDate).toLocaleDateString('es-MX')} →{' '}
                {new Date(goal.endDate).toLocaleDateString('es-MX')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEdit(goal)}
                disabled={!goal.isActive}
                aria-label={`Editar ${goal.title}`}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              {goal.isActive && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDeactivate(goal)}
                  aria-label={`Desactivar ${goal.title}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}

function GoalsManagerDialog({
  open,
  onOpenChange,
  goals,
  goalsLoading,
  onNew,
  onEdit,
  onDeactivate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: PrecampanaGoal[];
  goalsLoading: boolean;
  onNew: () => void;
  onEdit: (goal: PrecampanaGoal) => void;
  onDeactivate: (goal: PrecampanaGoal) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-140 bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Metas de Precampaña</DialogTitle>
          <DialogDescription>
            Creá, editá o desactivá las metas que rigen el avance de la precampaña.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <GoalsListPanel
            goals={goals}
            loading={goalsLoading}
            onEdit={onEdit}
            onDeactivate={onDeactivate}
          />
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={onNew}>
            <Plus className="w-4 h-4" />
            Nueva meta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 5. CSV export helper ─────────────────────────────────────────────────────

// ─── 5a. Global Goal banner (persistent) ──────────────────────────────────────

function GoalBanner({
  goal,
  onConfigure,
}: {
  goal: ResolvedGoalMetrics | null;
  onConfigure: () => void;
}) {
  if (!goal || goal.target <= 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-foreground">
              No hay una meta configurada para este contexto
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Configurá una meta para medir el avance sin inventar objetivos.
              {goal?.missingWeeks.length
                ? ` ${goal.missingWeeks.length} semana(s) sin meta configurada.`
                : ''}
            </p>
          </div>
          <Button variant="outline" onClick={onConfigure}>
            <Settings2 className="h-4 w-4" />
            Configurar Metas
          </Button>
        </div>
      </div>
    );
  }

  const usedLeaderQuota = goal.resolutionSource === 'LEADER_QUOTA_FALLBACK';
  const usedVotesRequired = goal.resolutionSource === 'SECTION_VOTES_REQUIRED';
  const bannerTitle = usedLeaderQuota
    ? `Cuota de ${goal.contextLabel}`
    : usedVotesRequired
      ? goal.contextLabel.startsWith('Coordinador ')
        ? `Aporte a la meta seccional · ${goal.contextLabel}`
        : `Votos necesarios · ${goal.contextLabel}`
      : goal.cadence === 'PERIOD'
        ? 'Meta del período'
        : goal.contextLabel.startsWith('Sección ')
          ? `Meta de ${goal.contextLabel}`
          : goal.contextLabel.startsWith('Líder ')
            ? `Meta de ${goal.contextLabel}`
            : goal.contextLabel.startsWith('Coordinador ')
              ? `Meta de ${goal.contextLabel}`
              : 'Meta Global de Precampaña';
  const remaining = Math.max(0, goal.target - goal.current);
  const elapsedDays = Math.max(
    1,
    Math.ceil((Date.now() - new Date(goal.startDate).getTime()) / 86_400_000),
  );
  const dailyPace = Math.round(goal.current / elapsedDays);
  const daysToGoal = dailyPace > 0 ? Math.ceil(remaining / dailyPace) : 0;
  const pctRounded = Math.round(goal.progressPct);
  const usedSectionFallback =
    goal.resolutionSource === 'SECTION_FALLBACK' ||
    goal.fallbackSources.includes('SECTION_FALLBACK');
  const usedGlobalFallback =
    goal.resolutionSource === 'GLOBAL_FALLBACK' || goal.fallbackSources.includes('GLOBAL_FALLBACK');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="min-w-0 bg-linear-to-r from-primary to-primary-hover rounded-2xl p-4 sm:p-5 text-primary-foreground shadow-md"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: title + numbers */}
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-foreground/15 flex items-center justify-center shrink-0">
            <Target className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider opacity-70">
              {bannerTitle}
            </div>
            <div className="text-2xl font-black leading-tight">
              {goal.current.toLocaleString('es-MX')}{' '}
              <span className="text-lg font-bold opacity-70">
                / {goal.target.toLocaleString('es-MX')}
              </span>
            </div>
            <div className="text-xs opacity-80 mt-0.5">
              {goal.title} · Faltan {remaining.toLocaleString('es-MX')} promovidos
            </div>
            {usedLeaderQuota && (
              <div className="mt-1 text-xs font-semibold text-primary-foreground/90">
                Se usa la cuota asignada al líder porque no hay una meta de campaña configurada para
                él.
              </div>
            )}
            {usedVotesRequired && (
              <div className="mt-1 text-xs font-semibold text-primary-foreground/90">
                {goal.contextLabel.startsWith('Coordinador ')
                  ? 'El avance del coordinador se mide contra los votos necesarios de su sección, no como una cuota propia.'
                  : 'Se usa el campo votos necesarios de la sección como meta de campaña.'}
              </div>
            )}
            {usedSectionFallback && (
              <div className="mt-1 text-xs font-semibold text-primary-foreground/90">
                Se usa la meta de la sección porque no hay una meta específica para el líder.
              </div>
            )}
            {usedGlobalFallback && (
              <div className="mt-1 text-xs font-semibold text-primary-foreground/90">
                Se usa la meta global porque no hay una meta específica para este contexto.
              </div>
            )}
            {goal.missingWeeks.length > 0 && (
              <div className="mt-1 text-xs font-bold text-amber-100">
                {goal.missingWeeks.length} semana(s) sin meta configurada
              </div>
            )}
          </div>
        </div>

        {/* Right: progress + pace */}
        <div className="flex min-w-0 flex-col gap-2 lg:w-[40%] lg:shrink-0">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Avance</span>
            <span className="text-2xl font-black">{pctRounded}%</span>
          </div>
          <div className="h-3 rounded-full bg-primary-foreground/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-foreground transition-all duration-700"
              style={{ width: `${Math.min(100, pctRounded)}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-80">
            <span>Ritmo: {dailyPace.toLocaleString('es-MX')}/día</span>
            <span>
              {remaining === 0
                ? 'Meta alcanzada'
                : daysToGoal > 0
                  ? `~${daysToGoal} días estimados`
                  : 'Ritmo insuficiente'}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── 5b. CSV export helper ────────────────────────────────────────────────────

function exportToCSV(filename: string, rows: (string | number)[][]) {
  if (rows.length === 0) {
    toast.error('No hay datos para exportar.');
    return;
  }
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── 6. Main component ────────────────────────────────────────────────────────

export function DashboardViewPrecampana() {
  const {
    metrics,
    loading,
    filter,
    filterOptions,
    filterMode,
    sectionId,
    leaderId,
    coordinatorId,
    dateFrom,
    dateTo,
    setFilterMode,
    setSectionId,
    setLeaderId,
    setCoordinatorId,
    setDateFrom,
    setDateTo,
    clearFilters,
    refresh,
  } = usePrecampanaDashboard();

  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goals, setGoals] = useState<PrecampanaGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [editingGoal, setEditingGoal] = useState<PrecampanaGoal | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchGoals = useCallback(async () => {
    setGoalsLoading(true);
    const result = await precampanaApi.listGoals();
    if (result.ok) {
      setGoals(result.data ?? []);
    } else {
      setGoals([]);
    }
    setGoalsLoading(false);
  }, []);

  const handleOpenGoals = (open: boolean) => {
    setGoalsOpen(open);
    if (open) void fetchGoals();
  };

  const handleNewGoal = () => {
    setEditingGoal(null);
    setModalOpen(true);
  };

  const handleEditGoal = (goal: PrecampanaGoal) => {
    setEditingGoal(goal);
    setModalOpen(true);
  };

  const handleDeactivateGoal = async (goal: PrecampanaGoal) => {
    const result = await precampanaApi.deactivateGoal(goal.id);
    if (result.ok) {
      toast.success(`Meta "${goal.title}" desactivada.`);
      void fetchGoals();
      void refresh();
    } else {
      toast.error(result.message || 'No se pudo desactivar la meta.');
    }
  };

  const handleSaved = () => {
    void fetchGoals();
    void refresh();
  };

  const sparklineData = useMemo(() => {
    const totals = metrics.weeklyGrowth.map((week) => week.total);
    return totals.slice(-8);
  }, [metrics.weeklyGrowth]);

  const growthWithIdeal = useMemo(() => {
    const len = metrics.weeklyGrowth.length;
    if (len === 0) return [];
    return metrics.weeklyGrowth.map((week, idx) => ({
      ...week,
      idealPace: metrics.globalGoal ? Math.round((metrics.globalGoal.target * (idx + 1)) / len) : 0,
    }));
  }, [metrics.weeklyGrowth, metrics.globalGoal]);

  const topLeaders = useMemo(
    () => [...metrics.byLeader].sort((a, b) => b.total - a.total).slice(0, 10),
    [metrics.byLeader],
  );

  const lastRegLabel = useMemo(() => {
    if (!metrics.lastRegistrationDate) return 'Sin registros';
    try {
      return `Último registro: ${new Date(metrics.lastRegistrationDate).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    } catch {
      return 'Sin registros';
    }
  }, [metrics.lastRegistrationDate]);

  const weeklyGoalLabel = useMemo(() => {
    const goal = metrics.resolvedWeeklyGoal;
    if (goal?.cadence === 'PERIOD') return 'Meta del Período';
    if (goal?.contextLabel.startsWith('Sección ')) return 'Meta Semanal de Sección';
    if (goal?.contextLabel.startsWith('Líder ')) return 'Meta Semanal de Líder';
    if (goal?.contextLabel.startsWith('Coordinador ')) return 'Meta Semanal de Coordinador';
    return 'Meta Semanal del Equipo';
  }, [metrics.resolvedWeeklyGoal]);

  const handleReport = useCallback(() => {
    const stamp = new Date().toISOString().slice(0, 10);
    exportToCSV(`reporte_precampana_${stamp}`, buildPrecampanaReportRows(metrics));
    toast.success('Reporte generado.');
  }, [metrics]);

  const handleDailyReport = useCallback(() => {
    const stamp = new Date().toISOString().slice(0, 10);
    exportToCSV(`reporte_diario_${stamp}`, buildPrecampanaReportRows(metrics));
    toast.success('Reporte diario generado.');
  }, [metrics]);

  return (
    <div className="h-full min-w-0 max-w-full overflow-y-auto">
      <div className="min-w-0 p-4 sm:p-6 space-y-6 wrap-anywhere">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-black text-foreground">
              Indicadores — Precampaña (Promovidos)
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Cintalapa de Figueroa, Chiapas · Datos en tiempo real
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button onClick={() => handleOpenGoals(true)} variant="default">
              <Settings2 className="w-4 h-4" />
              Configurar Metas
            </Button>
            <Button onClick={handleReport} variant="outline">
              <FileDown className="w-4 h-4" />
              Generar Reporte Integral
            </Button>
          </div>
        </div>

        <PrecampanaFiltersBar
          filterMode={filterMode}
          sectionId={sectionId}
          leaderId={leaderId}
          coordinatorId={coordinatorId}
          dateFrom={dateFrom}
          dateTo={dateTo}
          hasFilter={Boolean(filter)}
          options={filterOptions}
          onFilterModeChange={setFilterMode}
          onSectionIdChange={setSectionId}
          onLeaderIdChange={setLeaderId}
          onCoordinatorIdChange={setCoordinatorId}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onClear={clearFilters}
        />

        {!loading && (
          <GoalBanner goal={metrics.resolvedGoal} onConfigure={() => handleOpenGoals(true)} />
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <KpiSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Total Promovidos"
              value={metrics.total.toLocaleString('es-MX')}
              icon={Users}
              iconColor="bg-primary/10 text-primary"
              delay={0}
            >
              <span className="text-xs text-muted-foreground">{lastRegLabel}</span>
              <Sparkline data={sparklineData} color="var(--color-primary)" />
            </KpiCard>

            <KpiCard
              label="Efectividad de Líderes"
              value={`${Math.round(metrics.leaderEffectivenessPct)}%`}
              icon={TrendingUp}
              iconColor="bg-accent/10 text-accent"
              delay={0.07}
            >
              <span className="text-xs text-muted-foreground">
                {metrics.leadersMeetingQuota} con cuota cumplida · {metrics.leadersWithoutQuota} sin
                cuota
              </span>
              <Progress
                value={metrics.leaderEffectivenessPct}
                className="h-2 bg-muted [&>div]:bg-accent"
              />
            </KpiCard>

            <KpiCard
              label={weeklyGoalLabel}
              value={
                metrics.resolvedWeeklyGoal && metrics.resolvedWeeklyGoal.target > 0
                  ? `${Math.round(metrics.resolvedWeeklyGoal.progressPct)}%`
                  : 'Sin meta'
              }
              icon={CalendarDays}
              iconColor="bg-secondary/10 text-secondary"
              delay={0.14}
            >
              {metrics.resolvedWeeklyGoal && metrics.resolvedWeeklyGoal.target > 0 ? (
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">
                    {metrics.resolvedWeeklyGoal.current.toLocaleString('es-MX')} /{' '}
                    {metrics.resolvedWeeklyGoal.target.toLocaleString('es-MX')}{' '}
                    {metrics.resolvedWeeklyGoal.cadence === 'PERIOD'
                      ? 'promovidos en el período'
                      : 'promovidos esta semana'}
                  </span>
                  <Progress
                    value={metrics.resolvedWeeklyGoal.progressPct}
                    className="h-2 bg-muted [&>div]:bg-secondary"
                  />
                  <span className="text-xs text-muted-foreground">
                    {metrics.resolvedWeeklyGoal.contextLabel}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Configurá una meta para el alcance seleccionado
                </span>
              )}
            </KpiCard>

            <KpiCard
              label="Calidad y Verificación"
              value={`${Math.round(metrics.dataQualityPct)}%`}
              icon={ShieldCheck}
              iconColor="bg-green-100 text-green-700"
              delay={0.21}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {metrics.verifiedPromovidos} de {metrics.total} con INE verificado
                </span>
                {metrics.dataQualityPct >= 100 && (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                )}
              </div>
              <Progress
                value={metrics.dataQualityPct}
                className="h-2 bg-muted [&>div]:bg-green-600"
              />
            </KpiCard>
          </div>
        )}

        <div className="grid min-w-0 grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="min-w-0 lg:col-span-2 bg-card border border-border rounded-2xl p-4 sm:p-5"
          >
            <CoberturaTerritorial metrics={metrics} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="min-w-0 bg-card border border-border rounded-2xl p-4 sm:p-5"
          >
            <div className="mb-4">
              <h2 className="font-black text-foreground text-sm">Top Líderes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Promovidos registrados · Top 10
              </p>
            </div>
            {topLeaders.length === 0 ? (
              <ChartEmpty message="Sin líderes con registros todavía." />
            ) : (
              <div
                className="min-w-0 max-w-full overflow-auto max-h-75"
                role="region"
                aria-label="Top líderes"
                tabIndex={0}
              >
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="text-left font-semibold py-2 pr-2">#</th>
                      <th className="text-left font-semibold py-2 pr-2">Líder</th>
                      <th className="text-right font-semibold py-2">Promovidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topLeaders.map((leader, idx) => (
                      <tr key={leader.leaderId} className="border-b border-border last:border-0">
                        <td className="py-2 pr-2 text-muted-foreground font-semibold">{idx + 1}</td>
                        <td className="py-2 pr-2 max-w-40">
                          <span className="truncate block text-foreground">
                            {leader.leaderName || 'Sin líder'}
                          </span>
                        </td>
                        <td className="py-2 text-right font-semibold text-foreground">
                          {leader.total.toLocaleString('es-MX')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="min-w-0 bg-card border border-border rounded-2xl p-4 sm:p-5"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="min-w-0">
              <h2 className="font-black text-foreground text-sm">
                Crecimiento de Promovidos — Proyección Electoral
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Acumulado por semana vs meta ideal proyectada
              </p>
            </div>
            <span className="w-fit shrink-0 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
              Últimas 12 semanas
            </span>
          </div>

          {growthWithIdeal.length === 0 ? (
            <ChartEmpty message="Aún no hay suficientes semanas para mostrar el crecimiento." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={growthWithIdeal}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="weekLabel"
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
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine
                    x="S6"
                    stroke="var(--color-accent)"
                    label={{
                      value: 'Cierre Registro INE',
                      position: 'top',
                      fill: 'var(--color-accent)',
                      fontSize: 10,
                    }}
                  />
                  <ReferenceLine
                    x="S10"
                    stroke="var(--color-accent)"
                    label={{
                      value: 'Inicio Campaña',
                      position: 'top',
                      fill: 'var(--color-accent)',
                      fontSize: 10,
                    }}
                  />
                  <ReferenceLine
                    x="S12"
                    stroke="var(--color-accent)"
                    label={{
                      value: 'Jornada Electoral',
                      position: 'top',
                      fill: 'var(--color-accent)',
                      fontSize: 10,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    stroke="var(--color-primary)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: 'var(--color-primary)' }}
                    name="Acumulado"
                  />
                  <Line
                    type="monotone"
                    dataKey="idealPace"
                    stroke="var(--color-primary-light)"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Meta Ideal"
                  />
                </LineChart>
              </ResponsiveContainer>

              <div
                className="mt-4 max-w-full bg-card border border-border rounded-xl overflow-x-auto"
                role="region"
                aria-label="Crecimiento semanal de promovidos"
                tabIndex={0}
              >
                <table className="w-full min-w-140 text-xs wrap-normal">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="text-left font-semibold py-2 px-3">Semana</th>
                      <th className="text-right font-semibold py-2 px-3">Nuevos</th>
                      <th className="text-right font-semibold py-2 px-3">Crecimiento %</th>
                      <th className="text-left font-semibold py-2 px-3">Líder Más Activo</th>
                      <th className="text-left font-semibold py-2 px-3">Meta Semanal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {growthWithIdeal.map((week, idx) => {
                      const prev = idx > 0 ? growthWithIdeal[idx - 1] : null;
                      const growthPct =
                        prev && prev.total > 0
                          ? (((week.total - prev.total) / prev.total) * 100).toFixed(1)
                          : null;
                      const activity = metrics.weeklyLeaderActivity[idx];
                      const weeklyTarget =
                        metrics.resolvedWeeklyGoal?.cadence === 'WEEKLY' &&
                        idx === growthWithIdeal.length - 1
                          ? metrics.resolvedWeeklyGoal.target
                          : 0;
                      const metWeekly = weeklyTarget > 0 && week.total >= weeklyTarget;
                      return (
                        <tr
                          key={week.weekLabel}
                          className="even:bg-muted/30 border-b border-border last:border-0"
                        >
                          <td className="py-2 px-3 font-semibold text-foreground">
                            {week.weekLabel}
                          </td>
                          <td className="py-2 px-3 text-right text-foreground">
                            {week.total.toLocaleString('es-MX')}
                          </td>
                          <td className="py-2 px-3 text-right text-muted-foreground">
                            {growthPct !== null ? `${growthPct}%` : '—'}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {activity?.topLeaderName ?? '—'}
                          </td>
                          <td className="py-2 px-3">
                            {weeklyTarget > 0 ? (
                              <span
                                className={cn(
                                  'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                  metWeekly
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-700',
                                )}
                              >
                                {metWeekly ? 'Cumplido' : 'No Cumplido'}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </motion.div>
      </div>

      <button
        onClick={handleDailyReport}
        title="Descargar Reporte del Día"
        aria-label="Descargar Reporte del Día"
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary-hover transition-colors"
      >
        <Download className="w-5 h-5" />
      </button>

      <CreateGoalModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditingGoal(null);
        }}
        goal={editingGoal}
        onSaved={handleSaved}
      />

      <GoalsManagerDialog
        open={goalsOpen}
        onOpenChange={handleOpenGoals}
        goals={goals}
        goalsLoading={goalsLoading}
        onNew={handleNewGoal}
        onEdit={handleEditGoal}
        onDeactivate={handleDeactivateGoal}
      />
    </div>
  );
}
