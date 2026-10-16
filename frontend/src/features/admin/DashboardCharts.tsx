import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fontSize, tokensOf } from '../../design/tokens';

/**
 * Graphiques du tableau de bord (Recharts). Couleurs validées (contraste, daltonisme) sur les
 * surfaces claire et sombre ; la série « terminées » est aussi tiretée (codage secondaire), et
 * chaque graphique a sa vue tableau.
 */
const SERIES = {
  light: { created: '#4f46e5', completed: '#0d9488' },
  dark: { created: '#6366f1', completed: '#0d9488' },
} as const;

const shortDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dayOf = (day: string) => new Date(`${day}T12:00:00`);

function useChartTheme() {
  const theme = useTheme();
  const t = tokensOf(theme);
  return {
    series: SERIES[theme.palette.mode],
    axis: { stroke: t.border, tick: { fill: t.textSecondary, fontSize: fontSize.xs } },
    grid: t.border,
    tooltip: {
      contentStyle: { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, fontSize: fontSize.sm, color: t.text },
      labelStyle: { color: t.text, fontWeight: 500 },
      cursor: { fill: t.surfaceMuted, stroke: t.borderStrong },
    },
  };
}

/** Données du graphique sous forme de tableau, repliées par défaut. */
function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <Box component="details" sx={{ mt: 1, fontSize: fontSize.sm, '& summary': { cursor: 'pointer', color: 'text.secondary', minHeight: 32 } }}>
      <summary>Voir les données</summary>
      <Box sx={{ maxHeight: 240, overflow: 'auto' }}>
        <Box
          component="table"
          sx={{ width: '100%', borderCollapse: 'collapse', '& th, & td': { textAlign: 'left', py: 0.5, pr: 2, borderBottom: 1, borderColor: 'divider' }, '& td + td, & th + th': { textAlign: 'right' } }}
        >
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{caption}</caption>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i}>
                {cells.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>
    </Box>
  );
}

/** Répartition des demandes de la période par état (une seule série : pas de légende). */
export function StatusChart({ data }: { data: Array<{ label: string; count: number }> }) {
  const c = useChartTheme();
  return (
    <Box>
      <Box role="img" aria-label="Répartition des demandes par état" sx={{ height: Math.max(180, data.length * 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke={c.grid} strokeDasharray="0" />
            <XAxis type="number" allowDecimals={false} {...c.axis} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" width={170} {...c.axis} tickLine={false} />
            <Tooltip {...c.tooltip} formatter={(value) => [value, 'Demandes']} />
            <Bar dataKey="count" name="Demandes" fill={c.series.created} radius={[0, 4, 4, 0]} maxBarSize={24} label={{ position: 'right', fill: c.axis.tick.fill, fontSize: fontSize.xs }} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
      <DataTable caption="Demandes par état" head={['État', 'Demandes']} rows={data.map((d) => [d.label, d.count])} />
    </Box>
  );
}

/** Demandes créées et terminées par jour sur la période. */
export function DailyChart({ data }: { data: Array<{ day: string; created: number; completed: number }> }) {
  const c = useChartTheme();
  return (
    <Box>
      <Box role="img" aria-label="Demandes créées et terminées par jour" sx={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="day" tickFormatter={(d: string) => shortDay.format(dayOf(d))} minTickGap={24} {...c.axis} tickLine={false} />
            <YAxis allowDecimals={false} {...c.axis} tickLine={false} axisLine={false} />
            <Tooltip {...c.tooltip} labelFormatter={(d) => longDay.format(dayOf(String(d)))} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: fontSize.sm, color: c.axis.tick.fill }} />
            <Line type="monotone" dataKey="created" name="Créées" stroke={c.series.created} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="completed" name="Terminées" stroke={c.series.completed} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </Box>
      <DataTable
        caption="Demandes créées et terminées par jour"
        head={['Jour', 'Créées', 'Terminées']}
        rows={data.map((d) => [shortDay.format(dayOf(d.day)), d.created, d.completed])}
      />
    </Box>
  );
}
