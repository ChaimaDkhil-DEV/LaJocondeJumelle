import Box from '@mui/material/Box';
import { Check } from 'lucide-react';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';

export interface FilterChipItem<K extends string> {
  key: K;
  label: string;
  /** Effectif affiché après le libellé ; absent : le libellé seul. */
  count?: number;
  /** Teinte du contour au repos : accent (neutre), rouge ou ambre. */
  tone?: 'accent' | 'error' | 'warning';
}

interface FilterChipsProps<K extends string> {
  /** Nom du groupe, lu par les lecteurs d'écran. */
  label: string;
  items: ReadonlyArray<FilterChipItem<K>>;
  /** Pastille choisie ; null : aucune. */
  value: K | null;
  onChange: (key: K) => void;
}

/**
 * Pastilles-filtres du tableau de bord (« À traiter maintenant », onglet Demandes) : un bouton à bascule par
 * pastille. Au repos, le contour et le texte portent la teinte ; choisie, le fond se teinte et une coche
 * s'ajoute, pour que le choix ne tienne pas à la seule couleur.
 */
export function FilterChips<K extends string>({ label, items, value, onChange }: FilterChipsProps<K>) {
  return (
    <Box role="group" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {items.map((item) => {
        const pressed = value === item.key;
        const tone = item.tone ?? 'accent';
        return (
          <Box
            key={item.key}
            component="button"
            type="button"
            aria-pressed={pressed}
            aria-label={item.count === undefined ? undefined : `${item.label} ${item.count}`}
            onClick={() => onChange(item.key)}
            sx={(theme) => {
              const k = tokensOf(theme);
              const c = k[tone];
              return {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                minHeight: 32,
                px: 1.5,
                borderRadius: '999px',
                cursor: 'pointer',
                font: 'inherit',
                fontSize: fontSize.sm,
                border: `1px solid ${pressed ? c.main : tone === 'accent' ? k.border : c.border}`,
                bgcolor: pressed ? c.soft : k.surface,
                color: pressed || tone !== 'accent' ? c.text : k.text,
                fontWeight: pressed ? font.semibold : font.medium,
                '&:hover': { borderColor: c.main },
                '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                '@media (pointer: coarse)': { minHeight: 44 },
              };
            }}
          >
            {pressed && <Check size={icon.sm - 2} strokeWidth={icon.stroke + 0.5} aria-hidden="true" />}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {item.count}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
