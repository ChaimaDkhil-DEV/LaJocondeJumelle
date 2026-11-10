import Box from '@mui/material/Box';
import { Minus, Siren, type LucideIcon } from 'lucide-react';
import type { Priority } from '../api/types';
import { fontSize, type Tone } from '../design/tokens';
import { Badge } from './Badge';
import { t } from '../i18n';

/** Les deux priorités métier (016), dans l'ordre des formulaires : la courante d'abord. */
export const PRIORITIES: readonly Priority[] = ['NORMAL', 'URGENT'];

/** Valeur reçue d'une adresse ou d'un stockage local : une priorité en vigueur, ou rien. */
export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value);
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  NORMAL: t('Normale'),
  URGENT: t('Urgente'),
};

/**
 * Priorités retirées par la migration 0024 (016 : MEDIUM devenue Normale, HIGH devenue Urgente). Elles ne
 * se choisissent plus nulle part ; l'historique des demandes, jamais réécrit, peut encore les citer.
 */
const LEGACY_PRIORITY_LABELS: Record<string, string> = {
  MEDIUM: t('Moyenne'),
  HIGH: t('Haute'),
};

/** Libellé d'une priorité lue dans l'historique : en vigueur, ancienne, ou « — » si inconnue. */
export function historyPriorityLabel(value: unknown): string {
  if (isPriority(value)) return PRIORITY_LABELS[value];
  return (typeof value === 'string' && LEGACY_PRIORITY_LABELS[value]) || '—';
}

/** Trait pour la priorité courante, sirène rouge pour l'urgence (repérable sans la couleur). */
export const PRIORITY_STYLE: Record<Priority, { tone: Tone; icon: LucideIcon }> = {
  NORMAL: { tone: 'neutral', icon: Minus },
  URGENT: { tone: 'error', icon: Siren },
};

/** Priorité : icône + libellé ; « Urgente » est repérable sans la couleur (icône dédiée). */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const { tone, icon } = PRIORITY_STYLE[priority];
  return (
    <Badge tone={tone} icon={icon} iconTestId={priority === 'URGENT' ? 'priority-urgent-icon' : undefined}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

/**
 * Priorité sobre (listes d'alerte du tableau de bord) : badge doux rouge seulement pour « Urgente » ;
 * « Normale » en simple texte gris. Le libellé est toujours écrit : la couleur n'est qu'un complément.
 */
export function PriorityLabel({ priority }: { priority: Priority }) {
  if (priority === 'URGENT') return <Badge tone="error">{PRIORITY_LABELS[priority]}</Badge>;
  return (
    <Box component="span" sx={{ color: 'text.secondary', fontSize: fontSize.sm }}>
      {PRIORITY_LABELS[priority]}
    </Box>
  );
}
