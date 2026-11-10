import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import { keyframes } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  ArrowLeft,
  Ban,
  CheckCheck,
  CircleSlash,
  Clock,
  EllipsisVertical,
  MessagesSquare,
  PenLine,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router';
import { ApiError, loadErrorMessage } from '../../api/client';
import { visuallyHidden } from '../../components/a11y';
import { Badge, toneColors } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { IconAction } from '../../components/IconAction';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { UserAvatar } from '../../components/UserAvatar';
import { font, fontSize, icon, motion, radius, tokensOf, type Tone } from '../../design/tokens';
import { isPlural, locale, t } from '../../i18n';
import { useCurrentUser } from '../auth/useCurrentUser';
import { VoicePlayer } from '../voice/VoicePlayer';
import {
  fullName,
  useDiscussion,
  useDiscussions,
  useMessageDecision,
  type CommunicationDetail,
  type Decision,
  type Discussion,
  type DiscussionStatus,
  type DiscussionSummary,
  type Period,
} from './api';
import { CommunicationHistory, DeliveryList } from './CommunicationParts';

/**
 * « Communications à valider » (015) en messagerie : discussions à gauche (un enseignant, un élève,
 * un représentant), conversation à droite. Chaque message se modère seul : valider, retourner pour
 * correction ou rejeter n'agit que sur la version examinée de ce message.
 */

// ------------------------------------------------------------------ Statuts

const MESSAGE_STATUS: Record<DiscussionStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  PENDING_ADMIN_VALIDATION: { label: t('En attente de validation'), tone: 'warning', icon: Clock },
  APPROVED: { label: t('Validé'), tone: 'success', icon: CheckCheck },
  RETURNED_FOR_CORRECTION: { label: t('À corriger'), tone: 'info', icon: PenLine },
  REJECTED: { label: t('Rejeté'), tone: 'error', icon: Ban },
  CANCELLED: { label: t('Annulé par l’enseignant'), tone: 'neutral', icon: CircleSlash },
};

function MessageStatusBadge({ status }: { status: DiscussionStatus }) {
  const s = MESSAGE_STATUS[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

type Filter = 'PENDING' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'ALL';

const FILTERS: Array<{ value: Filter; label: string; status?: DiscussionStatus }> = [
  { value: 'PENDING', label: t('En attente'), status: 'PENDING_ADMIN_VALIDATION' },
  { value: 'APPROVED', label: t('Validés'), status: 'APPROVED' },
  { value: 'RETURNED', label: t('Retournés'), status: 'RETURNED_FOR_CORRECTION' },
  { value: 'REJECTED', label: t('Rejetés'), status: 'REJECTED' },
  { value: 'ALL', label: t('Toutes') },
];

const matchesFilter = (d: DiscussionSummary, filter: Filter) => {
  const status = FILTERS.find((f) => f.value === filter)?.status;
  return !status || d.counts[status] > 0;
};

/** Statut affiché pour la discussion : en attente s'il reste un message à examiner, sinon le dernier. */
const discussionStatus = (d: DiscussionSummary): DiscussionStatus =>
  d.counts.PENDING_ADMIN_VALIDATION > 0 ? 'PENDING_ADMIN_VALIDATION' : d.lastMessage.status;

// ------------------------------------------------------------------ Dates

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const timeOf = (value: string) =>
  new Date(value).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/** Liste des discussions : l'heure aujourd'hui, sinon la date courte. */
function shortWhen(value: string, now = new Date()): string {
  const date = new Date(value);
  if (sameDay(date, now)) return timeOf(value);
  return date.toLocaleDateString(
    locale(),
    date.getFullYear() === now.getFullYear()
      ? { day: 'numeric', month: 'short' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' },
  );
}

/** Séparateur de jour dans la conversation. */
function dayLabel(value: string, now = new Date()): string {
  const date = new Date(value);
  if (sameDay(date, now)) return t('Aujourd’hui');
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return t('Hier');
  return date.toLocaleDateString(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Première soumission d'un message : sa place dans la conversation. */
const sentAt = (m: CommunicationDetail) =>
  m.revisions[0]?.createdAt ?? m.submittedAt ?? m.createdAt;

const normalize = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale());

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
`;

const reducedMotion = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } } as const;

// ------------------------------------------------------------------ Page

export function ValidationInboxPage() {
  const { id } = useParams();
  const [period, setPeriod] = useState<Period>({});
  // Fin avant le début : la période n'est pas demandée au serveur.
  const invalidPeriod = Boolean(period.from && period.to && period.to < period.from);
  const discussions = useDiscussions(invalidPeriod ? { from: period.from } : period);
  const discussion = useDiscussion(id);

  return (
    <Box>
      <PageHeader
        title={t('Communications à valider')}
        description={t(
          'Lisez chaque discussion et validez, retournez ou rejetez ses messages un par un : seul un message validé est publié au parent.',
        )}
      />
      <Paper
        variant="elevated"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 340px) minmax(0, 1fr)' },
          height: { md: 'max(520px, calc(100dvh - 230px))' },
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: { xs: id ? 'none' : 'flex', md: 'flex' },
            flexDirection: 'column',
            minHeight: 0,
            borderRight: { md: 1 },
            borderColor: { md: 'divider' },
          }}
        >
          <DiscussionList
            query={discussions}
            selectedKey={discussion.data?.key}
            selectedId={id}
            period={period}
            invalidPeriod={invalidPeriod}
            onPeriodChange={setPeriod}
          />
        </Box>
        <Box
          component="section"
          aria-label={t('Conversation')}
          sx={{
            display: { xs: id ? 'flex' : 'none', md: 'flex' },
            flexDirection: 'column',
            minHeight: { xs: '70dvh', md: 0 },
            minWidth: 0,
          }}
        >
          {!id ? (
            <Box sx={{ m: 'auto', px: 2 }}>
              <EmptyState
                icon={MessagesSquare}
                title={t('Sélectionnez une discussion')}
                description={t(
                  'Choisissez une discussion à gauche pour lire ses messages et les modérer un par un.',
                )}
              />
            </Box>
          ) : discussion.isPending ? (
            <Box sx={{ m: 'auto' }}>
              <LoadingState label={t('Chargement de la discussion')} />
            </Box>
          ) : discussion.error ? (
            <Box sx={{ m: 'auto', p: 2 }}>
              <ErrorState
                message={loadErrorMessage(discussion.error, t('la discussion'))}
                actionLabel={t('Réessayer')}
                onAction={() => void discussion.refetch()}
              />
            </Box>
          ) : (
            <Conversation discussion={discussion.data} anchorId={id} />
          )}
        </Box>
      </Paper>
    </Box>
  );
}

// ------------------------------------------------------------------ Discussions (colonne de gauche)

function DiscussionList({
  query,
  selectedKey,
  selectedId,
  period,
  invalidPeriod,
  onPeriodChange,
}: {
  query: ReturnType<typeof useDiscussions>;
  selectedKey: string | undefined;
  selectedId: string | undefined;
  period: Period;
  invalidPeriod: boolean;
  onPeriodChange: (period: Period) => void;
}) {
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [search, setSearch] = useState('');
  const all = useMemo(() => query.data ?? [], [query.data]);
  const needle = normalize(search.trim());
  // La discussion ouverte reste visible même si elle ne correspond plus au filtre (dernier message validé).
  const visible = all.filter(
    (d) =>
      (matchesFilter(d, filter) || d.key === selectedKey) &&
      (!needle ||
        normalize(
          [
            d.teacher.displayName,
            fullName(d.student),
            d.student.class.name,
            fullName(d.guardian),
          ].join(' '),
        ).includes(needle)),
  );

  return (
    <>
      <Box
        sx={{ p: 2, pb: 1.5, display: 'grid', gap: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <TextField
          type="search"
          size="small"
          placeholder={t('Enseignant, élève, classe…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': t('Rechercher une discussion') },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={icon.sm} aria-hidden="true" />
                </InputAdornment>
              ),
            },
          }}
        />
        <PeriodFields value={period} invalid={invalidPeriod} onChange={onPeriodChange} />
        <Box
          role="group"
          aria-label={t('Filtrer les discussions')}
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}
        >
          {FILTERS.map((f) => {
            const count = all.filter((d) => matchesFilter(d, f.value)).length;
            const active = f.value === filter;
            return (
              <ButtonBase
                key={f.value}
                aria-pressed={active}
                onClick={() => setFilter(f.value)}
                sx={(theme) => {
                  const tk = tokensOf(theme);
                  return {
                    height: 28,
                    px: 1.25,
                    gap: 0.75,
                    borderRadius: `${radius.round}px`,
                    border: `1px solid ${active ? tk.accent.border : tk.border}`,
                    bgcolor: active ? tk.accent.soft : 'transparent',
                    color: active ? tk.accent.text : tk.textSecondary,
                    fontSize: fontSize.xs,
                    fontWeight: active ? font.semibold : font.medium,
                    transition: `background-color ${motion.fast}ms ${motion.easing}, color ${motion.fast}ms ${motion.easing}`,
                    '&:hover': { bgcolor: active ? tk.accent.soft : tk.surfaceMuted },
                    '&.Mui-focusVisible': { outline: `2px solid ${tk.focus}`, outlineOffset: 2 },
                  };
                }}
              >
                {f.label}
                {query.data && (
                  <Box component="span" sx={{ opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>
                    {count}
                  </Box>
                )}
              </ButtonBase>
            );
          })}
        </Box>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {query.isPending ? (
          <LoadingState label={t('Chargement des discussions')} />
        ) : query.error ? (
          <Box sx={{ p: 2 }}>
            <ErrorState
              message={loadErrorMessage(query.error, t('les discussions'))}
              actionLabel={t('Réessayer')}
              onAction={() => void query.refetch()}
            />
          </Box>
        ) : (
          <>
            <Box
              component="ul"
              aria-label={t('Discussions')}
              sx={{ listStyle: 'none', m: 0, p: 0.75, display: 'grid', gap: 0.25 }}
            >
              {visible.map((d) => (
                <DiscussionRow
                  key={d.key}
                  discussion={d}
                  selected={d.key === selectedKey || d.lastMessage.id === selectedId}
                />
              ))}
            </Box>
            {visible.length === 0 && (
              <EmptyState
                compact
                icon={MessagesSquare}
                title={
                  all.length === 0
                    ? t('Aucune communication à modérer')
                    : t('Aucune discussion ne correspond.')
                }
                description={
                  all.length === 0
                    ? t('Les messages soumis par les enseignants apparaîtront ici.')
                    : t('Changez de filtre, de période ou de recherche.')
                }
              />
            )}
          </>
        )}
      </Box>
    </>
  );
}

/** Période de soumission : seules les discussions qui ont un message soumis entre ces dates. */
function PeriodFields({
  value,
  invalid,
  onChange,
}: {
  value: Period;
  invalid: boolean;
  onChange: (period: Period) => void;
}) {
  const set = (patch: Period) => onChange({ ...value, ...patch });
  const dateField = {
    size: 'small',
    type: 'date',
    slotProps: { inputLabel: { shrink: true } },
  } as const;
  return (
    <Box
      role="group"
      aria-label={t('Période de soumission')}
      sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 1, alignItems: 'start' }}
    >
      <TextField
        {...dateField}
        id="validation-du"
        label={t('Du')}
        value={value.from ?? ''}
        onChange={(e) => set({ from: e.target.value || undefined })}
      />
      <TextField
        {...dateField}
        id="validation-au"
        label={t('Au')}
        value={value.to ?? ''}
        error={invalid}
        onChange={(e) => set({ to: e.target.value || undefined })}
      />
      {value.from || value.to ? (
        <IconAction
          icon={X}
          size="small"
          label={t('Effacer la période')}
          onClick={() => onChange({})}
        />
      ) : (
        <Box />
      )}
      {invalid && (
        <Typography
          role="alert"
          variant="caption"
          color="error"
          sx={{ gridColumn: '1 / -1', mt: -0.5 }}
        >
          {t('La date de fin précède la date de début.')}
        </Typography>
      )}
    </Box>
  );
}

function DiscussionRow({
  discussion: d,
  selected,
}: {
  discussion: DiscussionSummary;
  selected: boolean;
}) {
  const pending = d.counts.PENDING_ADMIN_VALIDATION;
  const status = MESSAGE_STATUS[discussionStatus(d)];
  return (
    <li>
      <Box
        component={RouterLink}
        to={`/communications-a-valider/${d.firstPendingId ?? d.lastMessage.id}`}
        aria-current={selected ? 'true' : undefined}
        sx={(theme) => {
          const tk = tokensOf(theme);
          return {
            display: 'grid',
            gridTemplateColumns: '40px minmax(0, 1fr) auto',
            columnGap: 1.25,
            alignItems: 'center',
            px: 1.25,
            py: 1,
            borderRadius: `${radius.control}px`,
            color: 'text.primary',
            textDecoration: 'none',
            bgcolor: selected ? tk.accent.soft : 'transparent',
            transition: `background-color ${motion.fast}ms ${motion.easing}`,
            '&:hover': { bgcolor: selected ? tk.accent.soft : tk.surfaceMuted },
            '&:focus-visible': { outline: `2px solid ${tk.focus}`, outlineOffset: -2 },
          };
        }}
      >
        <Box sx={{ position: 'relative', gridRow: '1 / span 3', alignSelf: 'center' }}>
          <UserAvatar user={d.teacher} size="lg" />
          {/* Indicateur de statut de la discussion, doublé d'un texte pour les lecteurs d'écran. */}
          <Box
            component="span"
            aria-hidden="true"
            sx={(theme) => ({
              position: 'absolute',
              right: -1,
              bottom: -1,
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: toneColors(theme, status.tone).main,
              border: `2px solid ${tokensOf(theme).surface}`,
            })}
          />
        </Box>
        <Typography
          component="span"
          variant="body2"
          noWrap
          sx={{ minWidth: 0, fontWeight: pending > 0 ? font.semibold : font.medium }}
        >
          {d.teacher.displayName}
        </Typography>
        {d.lastMessage.submittedAt ? (
          <Typography
            component="span"
            variant="caption"
            sx={{ color: pending > 0 ? 'primary.main' : 'text.secondary', whiteSpace: 'nowrap' }}
          >
            {shortWhen(d.lastMessage.submittedAt)}
          </Typography>
        ) : (
          <span />
        )}
        {/* Élève concerné, discret : une seule fois par discussion. */}
        <Typography
          component="span"
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ gridColumn: '2 / span 2', minWidth: 0 }}
        >
          {fullName(d.student)} · {d.student.class.name}
        </Typography>
        <Typography
          component="span"
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ minWidth: 0 }}
        >
          <Box component="span" sx={visuallyHidden}>
            {status.label} —{' '}
          </Box>
          {d.lastMessage.preview}
        </Typography>
        {pending > 0 ? (
          <Box
            component="span"
            aria-label={
              isPlural(pending)
                ? t('{count} messages en attente', { count: pending })
                : t('{count} message en attente', { count: pending })
            }
            sx={(theme) => ({
              minWidth: 20,
              height: 20,
              px: 0.75,
              borderRadius: `${radius.round}px`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              justifySelf: 'end',
              bgcolor: tokensOf(theme).accent.main,
              color: tokensOf(theme).accent.contrastText,
              fontSize: fontSize.xs,
              fontWeight: font.semibold,
              fontVariantNumeric: 'tabular-nums',
            })}
          >
            {pending}
          </Box>
        ) : (
          <span />
        )}
      </Box>
    </li>
  );
}

// ------------------------------------------------------------------ Conversation (colonne de droite)

function Conversation({ discussion: d, anchorId }: { discussion: Discussion; anchorId: string }) {
  const me = useCurrentUser();
  const scroller = useRef<HTMLDivElement>(null);
  const pending = d.messages.filter((m) => m.status === 'PENDING_ADMIN_VALIDATION').length;

  // Ouverture : le message désigné par l'adresse (premier à examiner, lien d'une notification).
  useEffect(() => {
    const target = scroller.current?.querySelector<HTMLElement>(`[data-message-id="${anchorId}"]`);
    target?.scrollIntoView?.({ block: 'center' });
  }, [anchorId, d.key]);

  return (
    <>
      <Box
        component="header"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          px: { xs: 1, sm: 2 },
          py: 1.25,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Tooltip title={t('Retour aux discussions')}>
          <IconButton
            component={RouterLink}
            to="/communications-a-valider"
            aria-label={t('Retour aux discussions')}
            sx={{ display: { md: 'none' } }}
          >
            <ArrowLeft size={icon.md} strokeWidth={icon.stroke} aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <UserAvatar user={d.teacher} size="lg" />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" component="h2" noWrap sx={{ fontWeight: font.semibold }}>
            {d.teacher.displayName}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            component="p"
            sx={{ overflowWrap: 'anywhere' }}
          >
            {t('Élève : {name} · {className}', {
              name: fullName(d.student),
              className: d.student.class.name,
            })}
            {' · '}
            {t('Destinataire : {name}', {
              name: `${fullName(d.guardian)}${d.guardian.relationship ? ` (${d.guardian.relationship})` : ''}`,
            })}
          </Typography>
        </Box>
        {pending > 0 && (
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Badge tone="warning" icon={Clock}>
              {t('{count} à valider', { count: pending })}
            </Badge>
          </Box>
        )}
      </Box>
      <Box
        ref={scroller}
        sx={(theme) => ({
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: { xs: 1.5, sm: 3 },
          py: 2,
          bgcolor: tokensOf(theme).background,
        })}
      >
        <Box
          component="ol"
          aria-label={t('Messages de la discussion')}
          sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}
        >
          {d.messages.map((m, index) => {
            const day = dayLabel(sentAt(m));
            const showDay = index === 0 || dayLabel(sentAt(d.messages[index - 1]!)) !== day;
            return (
              <Fragment key={m.id}>
                {showDay && (
                  <Box
                    component="li"
                    aria-hidden="true"
                    sx={{ display: 'flex', justifyContent: 'center' }}
                  >
                    <Typography
                      variant="caption"
                      sx={(theme) => ({
                        px: 1.25,
                        py: 0.25,
                        borderRadius: `${radius.round}px`,
                        bgcolor: tokensOf(theme).surface,
                        color: tokensOf(theme).textSecondary,
                        border: `1px solid ${tokensOf(theme).border}`,
                        '&::first-letter': { textTransform: 'uppercase' },
                      })}
                    >
                      {day}
                    </Typography>
                  </Box>
                )}
                <li>
                  <MessageBubble
                    message={m}
                    discussionId={anchorId}
                    highlighted={m.id === anchorId}
                    ownMessage={me.data?.id === m.teacher.id}
                  />
                </li>
              </Fragment>
            );
          })}
        </Box>
      </Box>
    </>
  );
}

// ------------------------------------------------------------------ Bulle d'un message

const SUCCESS: Record<Decision, string> = {
  APPROVE: t('Message validé et publié au parent.'),
  RETURN: t('Message retourné à l’enseignant pour correction.'),
  REJECT: t('Message rejeté.'),
};

function MessageBubble({
  message: m,
  discussionId,
  highlighted,
  ownMessage,
}: {
  message: CommunicationDetail;
  discussionId: string;
  highlighted: boolean;
  ownMessage: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const examined = m.revisions.find((r) => r.number === m.currentRevision) ?? m.revisions.at(-1);
  const previous = m.revisions.filter((r) => r.number !== examined?.number);
  const status = m.status as DiscussionStatus;
  const canDecide = status === 'PENDING_ADMIN_VALIDATION' && Boolean(examined) && !ownMessage;
  const first = m.revisions[0]?.createdAt;
  const decided =
    status === 'APPROVED' || status === 'REJECTED' || status === 'RETURNED_FOR_CORRECTION';

  return (
    <Box
      component="article"
      data-message-id={m.id}
      aria-label={t('Message du {date}', { date: formatDateTime(sentAt(m)) })}
      sx={(theme) => {
        const tk = tokensOf(theme);
        return {
          maxWidth: { xs: '100%', sm: '82%', lg: '72%' },
          px: { xs: 1.5, sm: 2 },
          py: 1.5,
          display: 'grid',
          gap: 1.25,
          bgcolor: tk.surface,
          border: `1px solid ${highlighted ? tk.accent.border : tk.border}`,
          boxShadow: highlighted
            ? `0 0 0 3px ${tk.accent.soft}`
            : '0 1px 2px rgba(16, 24, 40, 0.04)',
          // Bulle reçue : coin supérieur gauche resserré, comme une messagerie.
          borderRadius: '4px 16px 16px 16px',
          animation: `${fadeIn} ${motion.base}ms ${motion.easing}`,
          ...reducedMotion,
        };
      }}
    >
      {examined && (
        <>
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {examined.text}
          </Typography>
          <VoicePlayer
            key={examined.voiceFileId}
            src={`/api/files/${examined.voiceFileId}`}
            durationSeconds={examined.durationSeconds ?? undefined}
          />
        </>
      )}

      {decided && m.decisionReason && status !== 'APPROVED' && (
        <Box
          sx={(theme) => {
            const c = toneColors(theme, MESSAGE_STATUS[status].tone);
            return {
              px: 1.25,
              py: 0.75,
              borderRadius: `${radius.control}px`,
              borderLeft: `3px solid ${c.main}`,
              bgcolor: c.soft,
            };
          }}
        >
          <Typography variant="caption" component="p" sx={{ fontWeight: font.semibold }}>
            {status === 'REJECTED' ? t('Motif du rejet') : t('Motif du retour')}
            {m.decidedBy ? ` · ${m.decidedBy.displayName}` : ''}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {m.decisionReason}
          </Typography>
        </Box>
      )}

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 1,
          rowGap: 0.5,
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <MessageStatusBadge status={status} />
          {examined && examined.number > 1 && (
            <Typography variant="caption" color="text.secondary">
              {t('Version {number}', { number: examined.number })}
            </Typography>
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {first ? timeOf(first) : ''}
          {examined && first && examined.createdAt !== first
            ? ` · ${
                sameDay(new Date(examined.createdAt), new Date(first))
                  ? t('corrigé à {time}', { time: timeOf(examined.createdAt) })
                  : t('corrigé le {date}', { date: shortWhen(examined.createdAt) })
              }`
            : ''}
          {status === 'APPROVED' && m.decidedBy
            ? ` · ${t('validé par {name}', { name: m.decidedBy.displayName })}`
            : ''}
        </Typography>
      </Box>

      {ownMessage && status === 'PENDING_ADMIN_VALIDATION' && (
        <Typography variant="caption" color="text.secondary">
          {t('Vous êtes l’auteur de ce message : un autre responsable doit le valider.')}
        </Typography>
      )}

      {canDecide && examined && (
        <Moderation message={m} revision={examined.number} discussionId={discussionId} />
      )}

      <Box>
        <Button
          size="small"
          color="inherit"
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen((open) => !open)}
          sx={{ color: 'text.secondary', px: 0.75, minWidth: 0 }}
        >
          {t('Historique')}
        </Button>
        {historyOpen && (
          <Box
            sx={(theme) => ({
              mt: 1,
              pt: 1.25,
              borderTop: `1px dashed ${tokensOf(theme).border}`,
              display: 'grid',
              gap: 1.5,
            })}
          >
            {previous.map((r) => (
              <Box key={r.number} sx={{ display: 'grid', gap: 0.75 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: font.semibold }}
                >
                  {t('Version {number} · {date}', {
                    number: r.number,
                    date: formatDateTime(r.createdAt),
                  })}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                >
                  {r.text}
                </Typography>
                <VoicePlayer
                  key={r.voiceFileId}
                  src={`/api/files/${r.voiceFileId}`}
                  durationSeconds={r.durationSeconds ?? undefined}
                />
              </Box>
            ))}
            <CommunicationHistory events={m.events} />
            {status === 'APPROVED' && <DeliveryList deliveries={m.deliveries} />}
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ------------------------------------------------------------------ Modération d'un message

const REASON_MAX = 1000;

function Moderation({
  message: m,
  revision,
  discussionId,
}: {
  message: CommunicationDetail;
  revision: number;
  discussionId: string;
}) {
  const decision = useMessageDecision(discussionId);
  const toast = useToast();
  const [open, setOpen] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const reasonField = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && open !== 'APPROVE') reasonField.current?.focus();
  }, [open]);

  const start = (action: Decision) => {
    setOpen(action);
    setReason('');
    setMissing(false);
    setError(null);
  };

  const confirm = () => {
    if (!open) return;
    const trimmed = reason.trim();
    if (open !== 'APPROVE' && !trimmed) {
      setMissing(true);
      reasonField.current?.focus();
      return;
    }
    const action = open;
    decision.mutate(
      {
        id: m.id,
        action,
        revision,
        version: m.version,
        ...(action === 'APPROVE' ? {} : { reason: trimmed }),
      },
      {
        onSuccess: () => toast.success(SUCCESS[action]),
        onError: (e) =>
          setError(
            e instanceof ApiError
              ? e.message
              : t('La décision n’a pas pu être enregistrée. Réessayez.'),
          ),
      },
    );
  };

  if (!open) {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
        <Button size="small" variant="contained" onClick={() => start('APPROVE')}>
          {t('Valider')}
        </Button>
        <Button size="small" variant="outlined" onClick={() => start('RETURN')}>
          {t('Retourner pour correction')}
        </Button>
        <IconAction
          icon={EllipsisVertical}
          label={t('Plus d’actions')}
          size="small"
          aria-haspopup="menu"
          onClick={(e) => setMenu(e.currentTarget)}
        />
        <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
          <MenuItem
            onClick={() => {
              setMenu(null);
              start('REJECT');
            }}
            sx={{ color: 'error.main' }}
          >
            {t('Rejeter')}
          </MenuItem>
        </Menu>
      </Box>
    );
  }

  const copy = {
    APPROVE: {
      text: t('Publier ce message au parent ? La publication est définitive.'),
      confirm: t('Valider et publier'),
    },
    RETURN: {
      text: t('L’enseignant pourra modifier ce message puis le soumettre à nouveau.'),
      confirm: t('Retourner'),
    },
    REJECT: {
      text: t('Le rejet est définitif : ce message ne sera jamais publié.'),
      confirm: t('Rejeter'),
    },
  }[open];

  return (
    <Box
      role="group"
      aria-label={copy.confirm}
      sx={(theme) => ({
        display: 'grid',
        gap: 1,
        p: 1.25,
        borderRadius: `${radius.control}px`,
        bgcolor: tokensOf(theme).surfaceMuted,
        animation: `${fadeIn} ${motion.fast}ms ${motion.easing}`,
        ...reducedMotion,
      })}
    >
      <Typography variant="body2">{copy.text}</Typography>
      {open !== 'APPROVE' && (
        <TextField
          inputRef={reasonField}
          size="small"
          multiline
          minRows={2}
          label={open === 'RETURN' ? t('Motif du retour') : t('Motif du rejet')}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (e.target.value.trim()) setMissing(false);
          }}
          error={missing}
          helperText={
            missing
              ? open === 'RETURN'
                ? t('Indiquez ce que l’enseignant doit corriger.')
                : t('Indiquez le motif du rejet.')
              : undefined
          }
          slotProps={{ htmlInput: { maxLength: REASON_MAX } }}
          sx={{ bgcolor: 'background.paper' }}
        />
      )}
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.75 }}>
        <Button
          size="small"
          color="inherit"
          onClick={() => setOpen(null)}
          disabled={decision.isPending}
        >
          {t('Annuler')}
        </Button>
        <Button
          size="small"
          variant="contained"
          color={open === 'REJECT' ? 'error' : 'primary'}
          onClick={confirm}
          loading={decision.isPending}
        >
          {copy.confirm}
        </Button>
      </Box>
    </Box>
  );
}
