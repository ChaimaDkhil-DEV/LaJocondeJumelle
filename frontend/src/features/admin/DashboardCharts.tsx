import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

/**
 * Mini-graphique d'une carte d'indicateur : décoratif (`aria-hidden`), la valeur est écrite dans la
 * carte et le détail jour par jour est dans « Évolution quotidienne ».
 */
export function Sparkline({ values, color, kind = 'area' }: { values: number[]; color: string; kind?: 'area' | 'bars' }) {
  const data = values.map((value, index) => ({ index, value }));
  // Rien à montrer (aucun point, ou une période sans aucune valeur) : pas de trait plat.
  if (data.length < 2 || values.every((v) => v === 0)) return null;
  return (
    // Masqué sous 600 px : la valeur de la carte garde toute la largeur.
    <Box aria-hidden="true" sx={{ display: { xs: 'none', sm: 'block' }, width: 104, height: 44, flex: 'none' }}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'bars' ? (
          // Décoratif : pas de couche clavier Recharts (un élément aria-hidden ne doit pas être focusable).
          <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} minPointSize={2} isAnimationActive={false} />
          </BarChart>
        ) : (
          <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }} accessibilityLayer={false}>
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.12} dot={false} isAnimationActive={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </Box>
  );
}

/** Répartition par état en anneau, avec légende chiffrée (la couleur n'est jamais seule) et vue tableau. */
export function StatusDonut({ data }: { data: Array<{ label: string; count: number }> }) {
  const c = useChartTheme();
  const shown = data.filter((d) => d.count > 0);
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const colorOf = (index: number) => c.series.series[index % c.series.series.length];
  return (
    <Box>
      {/* Anneau puis légende : la carte est étroite (colonne de droite), les libellés restent entiers. */}
      <Box sx={{ display: 'grid', gap: 2 }}>
        <Box role="img" aria-label="Répartition des demandes par état" sx={{ height: 180, width: '100%', maxWidth: 220, mx: 'auto', position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip {...c.tooltip} formatter={(value, name) => [value, name]} />
              <Pie data={shown} dataKey="count" nameKey="label" innerRadius="62%" outerRadius="95%" paddingAngle={shown.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                {shown.map((d) => (
                  <Cell key={d.label} fill={colorOf(data.indexOf(d))} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <Box
            aria-hidden="true"
            sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
          >
            <Box component="span" sx={{ fontSize: fontSize.xl, fontWeight: font.semibold, lineHeight: 1.1 }}>
              {total}
            </Box>
            <Box component="span" sx={(theme) => ({ fontSize: fontSize.xs, color: tokensOf(theme).textSecondary })}>
              demandes
            </Box>
          </Box>
        </Box>
        <Box component="ul" aria-label="Légende : demandes par état" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
          {data.map((d, index) => (
            <Box component="li" key={d.label} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: fontSize.sm, minWidth: 0 }}>
              <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', flex: 'none', bgcolor: colorOf(index) }} />
              <Box component="span" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                {d.label}
              </Box>
              <Box component="span" sx={{ fontWeight: font.semibold, fontVariantNumeric: 'tabular-nums' }}>
                {d.count}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
      <DataTable caption="Demandes par état" head={['État', 'Demandes']} rows={data.map((d) => [d.label, d.count])} />
    </Box>
  );
}
