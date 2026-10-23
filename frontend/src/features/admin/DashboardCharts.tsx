import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { font, fontSize, radius, tokensOf } from '../../design/tokens';

/*
 * Graphiques du tableau de bord (Recharts). Couleurs des séries : tokens « chart » (contraste,
 * daltonisme) ; la série « terminées » est aussi tiretée (codage secondaire), et chaque graphique
 * a sa vue tableau.
 */

const shortDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dayOf = (day: string) => new Date(`${day}T12:00:00`);

function useChartTheme() {
  const theme = useTheme();
  const t = tokensOf(theme);
  return {
    series: t.chart,
    axis: { stroke: t.border, tick: { fill: t.textSecondary, fontSize: fontSize.xs } },
    grid: t.border,
    tooltip: {
      contentStyle: { background: t.surface, border: `1px solid ${t.border}`, borderRadius: radius.control, fontSize: fontSize.sm, color: t.text },
      labelStyle: { color: t.text, fontWeight: 500 },
      cursor: { fill: t.surfaceMuted, stroke: t.borderStrong },
    },
  };
}

/** Données du graphique sous forme de tableau, repliées par défaut. */
function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <Box
      component="details"
      sx={(theme) => ({
        mt: 1.5,
        pt: 1,
        borderTop: 1,
        borderColor: 'divider',
        fontSize: fontSize.sm,
        '& summary': {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'pointer',
          minHeight: 32,
          px: 1,
          ml: -1,
          borderRadius: `${radius.control}px`,
          fontWeight: font.medium,
          color: tokensOf(theme).textSecondary,
          '&:hover': { color: tokensOf(theme).text, bgcolor: tokensOf(theme).surfaceMuted },
          '@media (pointer: coarse)': { minHeight: 44 },
        },
      })}
    >
      <summary>Voir les données</summary>
      <Box tabIndex={0} role="region" aria-label={caption} sx={{ maxHeight: 240, overflow: 'auto' }}>
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

/** Libellé d'état posé au-dessus de sa barre : toute la largeur reste aux barres, même à 320 px. */
function BarCaption({ x, y, value, fill }: { x?: number | string; y?: number | string; value?: ReactNode; fill: string }) {
  return (
    <text x={Number(x)} y={Number(y) - 6} fill={fill} fontSize={fontSize.xs}>
      {value}
    </text>
  );
}

/** Répartition des demandes de la période par état (une seule série : pas de légende). */
export function StatusChart({ data }: { data: Array<{ label: string; count: number }> }) {
  const c = useChartTheme();
  return (
    <Box>
      <Box role="img" aria-label="Répartition des demandes par état" sx={{ height: data.length * 44 + 32 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 12, right: 40, bottom: 4, left: 0 }}>
            <CartesianGrid horizontal={false} stroke={c.grid} />
            <XAxis type="number" allowDecimals={false} {...c.axis} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" hide />
            <Tooltip {...c.tooltip} formatter={(value) => [value, 'Demandes']} />
            <Bar dataKey="count" name="Demandes" fill={c.series.created} radius={[0, 4, 4, 0]} barSize={12} minPointSize={2} label={{ position: 'right', fill: c.axis.tick.fill, fontSize: fontSize.xs }}>
              <LabelList dataKey="label" content={(props) => <BarCaption x={props.x} y={props.y} value={props.value} fill={c.axis.tick.fill} />} />
            </Bar>
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
  // Périodes courtes : un point par jour, pour lire chaque valeur ; au-delà, la courbe seule.
  const dot = (fill: string) => (data.length <= 14 ? { r: 3, fill, strokeWidth: 0, strokeDasharray: '0' } : false);
  return (
    <Box>
      <Box role="img" aria-label="Demandes créées et terminées par jour" sx={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="day" tickFormatter={(d: string) => shortDay.format(dayOf(d))} minTickGap={24} {...c.axis} tickLine={false} />
            <YAxis allowDecimals={false} {...c.axis} tickLine={false} axisLine={false} />
            <Tooltip {...c.tooltip} cursor={{ stroke: c.tooltip.cursor.stroke }} labelFormatter={(d) => longDay.format(dayOf(String(d)))} />
            <Legend verticalAlign="top" align="right" height={28} iconType="plainline" wrapperStyle={{ fontSize: fontSize.sm, color: c.axis.tick.fill }} />
            <Line type="monotone" dataKey="created" name="Créées" stroke={c.series.created} strokeWidth={2} dot={dot(c.series.created)} activeDot={{ r: 4 }} />
            <Line
              type="monotone"
              dataKey="completed"
              name="Terminées"
              stroke={c.series.completed}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={dot(c.series.completed)}
              activeDot={{ r: 4, strokeDasharray: '0' }}
            />
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
