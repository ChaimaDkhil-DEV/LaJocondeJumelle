import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useId } from 'react';
import { Link as RouterLink } from 'react-router';
import type { Priority, RequestStatus } from '../../api/types';
import { Badge } from '../../components/Badge';
import { STAGE_LABELS } from '../../components/Countdown';
import { PRIORITY_LABELS } from '../../components/PriorityBadge';
import { statusLabel, statusTone } from '../../components/StatusBadge';
import { font, fontSize, radius, tokensOf, type Tone } from '../../design/tokens';
import { locale, t } from '../../i18n';
import type { ActivityItem } from './dashboardApi';

/** Ce que l'acteur a fait, après son nom, selon le statut atteint. */
const STATUS_ACTIONS: Record<RequestStatus, string> = {
  DRAFT: t('a modifié le statut'),
  PENDING_ADMIN_VALIDATION: t('a envoyé en validation'),
  SENT: t('a marqué comme envoyée'),
  ACCEPTED: t('a accepté la demande'),
  IN_PROGRESS: t('a commencé le traitement'),
  DONE: t('a terminé le traitement'),
  PENDING_FINAL_VALIDATION: t('a envoyé en validation finale'),
  TO_CORRECT: t('a demandé une correction'),
  CLOSED: t('a clôturé la demande'),
  REJECTED: t('a refusé la demande'),
  CANCELLED: t('a annulé la demande'),
};

export interface ActivityLine {
  /** Phrase après le nom de l'acteur : « a créé la demande ». */
  action: string;
  /** Pastille de droite : le résultat de l'action. */
  pill: { label: string; tone: Tone };
}

const isStatus = (value: unknown): value is RequestStatus => typeof value === 'string' && Object.hasOwn(STATUS_ACTIONS, value);

/**
 * Une ligne d'activité en langage courant : l'action et son résultat. Elle ne reprend que les métadonnées en liste
 * blanche envoyées par le serveur (jamais le texte d'un message, d'un commentaire ou d'une pièce jointe).
 */
export function describeActivityLine(item: ActivityItem): ActivityLine {
  const d = item.details;
  switch (item.type) {
    case 'CREATED':
      return { action: t('a créé la demande'), pill: { label: t('Nouvelle'), tone: 'accent' } };
    case 'STATUS_CHANGED': {
      if (!isStatus(d.to)) return { action: t('a modifié le statut'), pill: { label: t('Mise à jour'), tone: 'neutral' } };
      return { action: STATUS_ACTIONS[d.to], pill: { label: statusLabel(d.to, true), tone: statusTone(d.to) } };
    }
    case 'PRIORITY_CHANGED': {
      const priority = d.to === 'URGENT' || d.to === 'NORMAL' ? (d.to as Priority) : null;
      return {
        action: t('a changé la priorité'),
        pill: priority ? { label: PRIORITY_LABELS[priority], tone: priority === 'URGENT' ? 'error' : 'neutral' } : { label: t('Mise à jour'), tone: 'neutral' },
      };
    }
    case 'ASSIGNED':
    case 'REASSIGNED': {
      const name = (d.assignee as { displayName?: string } | null | undefined)?.displayName;
      const reassigned = item.type === 'REASSIGNED';
      const action = name
        ? reassigned
          ? t('a réaffecté à {name}', { name })
          : t('a affecté à {name}', { name })
        : reassigned
          ? t('a réaffecté la demande')
          : t('a affecté la demande');
      return { action, pill: { label: reassigned ? t('Réaffectée') : t('Affectée'), tone: 'neutral' } };
    }
    case 'MESSAGE_ADDED':
      return { action: d.kind === 'VOICE' ? t('a envoyé un message vocal') : t('a écrit un message'), pill: { label: t('Message'), tone: 'info' } };
    case 'FILE_ADDED':
      return { action: t('a joint un fichier'), pill: { label: t('Fichier'), tone: 'info' } };
    case 'OVERDUE': {
      const stage = typeof d.stage === 'string' ? STAGE_LABELS[d.stage as keyof typeof STAGE_LABELS] : undefined;
      return { action: stage ? t('a signalé un retard ({stage})', { stage }) : t('a signalé un retard'), pill: { label: t('En retard'), tone: 'error' } };
    }
    default:
      return { action: t('a modifié la demande'), pill: { label: t('Mise à jour'), tone: 'neutral' } };
  }
}

const time = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' });
const dayLong = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
const dayLongYear = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Jour calendaire local (AAAA-MM-JJ) d'un instant. */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** « Aujourd'hui », « Hier », sinon la date (avec l'année si ce n'est pas l'année en cours). */
export function dayHeading(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (localDay(date) === localDay(now)) return t('Aujourd’hui');
  if (localDay(date) === localDay(yesterday)) return t('Hier');
  return (date.getFullYear() === now.getFullYear() ? dayLong : dayLongYear).format(date);
}

interface DayGroup {
  day: string;
  heading: string;
  items: ActivityItem[];
}

/** Actions regroupées par jour local, dans l'ordre reçu (les plus récentes d'abord). */
function groupByDay(items: ActivityItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const day = localDay(new Date(item.createdAt));
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, heading: dayHeading(item.createdAt), items: [item] });
  }
  return groups;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const { action, pill } = describeActivityLine(item);
  return (
    <Box
      component="li"
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: { xs: '48px minmax(0, 1fr)', sm: '56px minmax(0, 1fr) auto' },
        gridTemplateAreas: { xs: '"time text" ". pill"', sm: '"time text pill"' },
        alignItems: 'center',
        columnGap: 2,
        rowGap: 0.75,
        py: 1.75,
        '& + &': { borderTop: `1px solid ${tokensOf(theme).border}` },
      })}
    >
      <Box component="time" dateTime={item.createdAt} sx={(theme) => ({ gridArea: 'time', color: tokensOf(theme).textSecondary, fontSize: fontSize.sm, fontVariantNumeric: 'tabular-nums' })}>
        {time.format(new Date(item.createdAt))}
      </Box>
      <Box sx={{ gridArea: 'text', minWidth: 0, display: 'grid', gap: 0.25 }}>
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          <Box component="strong" sx={{ fontWeight: font.semibold }}>
            {item.actor ? item.actor.displayName : t('Le système')}
          </Box>{' '}
          {action}
        </Typography>
        <Box
          component={RouterLink}
          to={`/demandes/${item.request.id}`}
          sx={(theme) => ({
            color: tokensOf(theme).textSecondary,
            fontSize: fontSize.sm,
            textDecoration: 'none',
            overflowWrap: 'anywhere',
            '&:hover, &:focus-visible': { textDecoration: 'underline' },
          })}
        >
          {item.request.reference} · {item.request.title}
        </Box>
      </Box>
      <Box sx={{ gridArea: 'pill', justifySelf: { xs: 'start', sm: 'end' } }}>
        <Badge tone={pill.tone}>{pill.label}</Badge>
      </Box>
    </Box>
  );
}

/**
 * Fil d'activité du tableau de bord : une ligne par action (l'heure, qui a fait quoi, la demande, et le résultat en
 * pastille), regroupées par jour. Aucun contenu de message : seulement ce qui s'est passé.
 */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const prefix = useId();
  return (
    <Box component="section" aria-label={t('Dernières actions')}>
      {groupByDay(items).map((group, index) => {
        const headingId = `${prefix}-${index}`;
        return (
          <Box key={group.day} sx={{ '& + &': { mt: 1.5 } }}>
            <Typography
              id={headingId}
              component="h3"
              sx={(theme) => ({ fontSize: fontSize.sm, fontWeight: font.semibold, color: tokensOf(theme).textSecondary, pb: 0.5, '&::first-letter': { textTransform: 'uppercase' } })}
            >
              {group.heading}
            </Typography>
            <Box
              component="ul"
              aria-labelledby={headingId}
              sx={(theme) => ({ listStyle: 'none', m: 0, p: 0, borderTop: `1px solid ${tokensOf(theme).border}`, borderRadius: `${radius.control}px` })}
            >
              {group.items.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
