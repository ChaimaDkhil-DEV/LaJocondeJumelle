import type { CoverageStats } from './coverage-stats';

/** Résultat de `CoverageStatsService.stats` : statistiques et filtres effectifs (défauts appliqués). */
export interface StatsExport extends CoverageStats {
  from: string;
  to: string;
  groupBy: 'teacher' | 'class' | 'period';
  period: 'week' | 'month';
  timezone: string;
}

const GROUP_LABELS: Record<StatsExport['groupBy'], string> = {
  teacher: 'Enseignant',
  class: 'Classe',
  period: 'Période',
};
const PERIOD_LABELS: Record<StatsExport['period'], string> = { week: 'Semaine', month: 'Mois' };
const FILE_GROUPS: Record<StatsExport['groupBy'], string> = { teacher: 'enseignant', class: 'classe', period: '' };
const FILE_PERIODS: Record<StatsExport['period'], string> = { week: 'semaine', month: 'mois' };

/** Même règle que `formatDuration` de l'interface ; vide quand la page affiche « — ». */
function duration(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

const percent = (rate: number) => `${Math.round(rate * 100)} %`;

/**
 * Lignes du fichier d'export (spec 008, FR-002 à FR-004, research R2-R3) : le tableau de la page
 * (mêmes colonnes, libellés et ordre), une ligne de total, puis le contexte de l'export.
 */
export function statsToCsvRows(stats: StatsExport): { header: string[]; rows: unknown[][] } {
  const header = [
    GROUP_LABELS[stats.groupBy],
    'Événements',
    'Retards',
    'Absences',
    'Classes vides',
    'Non pourvues',
    'Annulées',
    'Durée moyenne',
  ];
  const line = (label: string, r: CoverageStats['totals'] | CoverageStats['rows'][number]) => [
    label,
    r.events,
    r.lateness,
    r.absence,
    r.emptyClass,
    r.unfilled,
    r.cancelled,
    duration(r.averageDurationMinutes),
  ];
  const rows: unknown[][] = [
    ...stats.rows.map((r) => line(r.label, r)),
    line('Total de la période', stats.totals),
    [],
    ['Du', stats.from],
    ['Au', stats.to],
    ['Fuseau', stats.timezone],
    ['Regroupement', GROUP_LABELS[stats.groupBy]],
    ...(stats.groupBy === 'period' ? [['Période', PERIOD_LABELS[stats.period]]] : []),
    ['Taux de non pourvue', percent(stats.totals.unfilledRate)],
    ['Doublons non tranchés (comptés une fois)', stats.totals.undecidedDuplicates],
  ];
  return { header, rows };
}

/** Nom du fichier (FR-005) : valeurs validées (dates AAAA-MM-JJ, listes fermées), ASCII seulement. */
export function statsCsvFilename(stats: StatsExport): string {
  const group = stats.groupBy === 'period' ? FILE_PERIODS[stats.period] : FILE_GROUPS[stats.groupBy];
  return `statistiques-affectations-${group}-${stats.from}-au-${stats.to}.csv`;
}
