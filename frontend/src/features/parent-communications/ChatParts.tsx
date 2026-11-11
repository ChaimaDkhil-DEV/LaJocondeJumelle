import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
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
  FilePen,
  PenLine,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { useClientSettings } from '../../api/settings';
import { visuallyHidden } from '../../components/a11y';
import { Badge } from '../../components/Badge';
import { font, fontSize, icon, motion, radius, tokensOf, type Tone } from '../../design/tokens';
import { isPlural, locale, t } from '../../i18n';
import { VoicePlayer } from '../voice/VoicePlayer';
import { VoiceRecorder, type VoiceRecording } from '../voice/VoiceRecorder';
import type { CommunicationStatus, Message } from './api';

/**
 * Messagerie des communications (015, 017) : éléments communs aux espaces enseignant, administration et
 * parent. Les informations communes (interlocuteur, élève, classe) sont dans l'en-tête, jamais répétées
 * dans les bulles.
 */

// ------------------------------------------------------------------ Dates

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const timeOf = (value: string) =>
  new Date(value).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/** Liste des conversations : l'heure aujourd'hui, sinon la date courte. */
export function shortWhen(value: string, now = new Date()): string {
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
export function dayLabel(value: string, now = new Date()): string {
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

export const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
`;

export const reducedMotion = {
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
} as const;

// ------------------------------------------------------------------ Mise en page

/** Deux colonnes : conversations à gauche, conversation ouverte à droite ; une seule sur mobile. */
export function ChatShell({
  list,
  detail,
  detailOpen,
  detailLabel = t('Conversation'),
}: {
  list: ReactNode;
  detail: ReactNode;
  /** Sur mobile, la conversation remplace la liste. */
  detailOpen: boolean;
  detailLabel?: string;
}) {
  return (
    <Paper
      variant="elevated"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 320px) minmax(0, 1fr)' },
        height: { md: 'max(520px, calc(100dvh - 230px))' },
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: { xs: detailOpen ? 'none' : 'flex', md: 'flex' },
          flexDirection: 'column',
          minHeight: 0,
          borderRight: { md: 1 },
          borderColor: { md: 'divider' },
        }}
      >
        {list}
      </Box>
      <Box
        component="section"
        aria-label={detailLabel}
        sx={{
          display: { xs: detailOpen ? 'flex' : 'none', md: 'flex' },
          flexDirection: 'column',
          minHeight: { xs: '70dvh', md: 0 },
          minWidth: 0,
        }}
      >
        {detail}
      </Box>
    </Paper>
  );
}

/** Pastille du nombre de messages non lus (ou en attente), doublée d'un libellé accessible. */
export function CountBadge({ count, label }: { count: number; label: string }) {
  return (
    <Box
      component="span"
      aria-label={label}
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
      {count}
    </Box>
  );
}

export const unreadLabel = (count: number) =>
  isPlural(count)
    ? t('{count} messages non lus', { count })
    : t('{count} message non lu', { count });

/** Ligne d'une conversation dans la colonne de gauche. */
export function ConversationLink({
  to,
  avatar,
  title,
  subtitle,
  preview,
  when,
  unread,
  selected,
}: {
  to: string;
  avatar: ReactNode;
  title: string;
  subtitle: string;
  preview: string;
  when: string | null;
  unread: number;
  selected: boolean;
}) {
  return (
    <li>
      <Box
        component={RouterLink}
        to={to}
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
        <Box sx={{ gridRow: '1 / span 3', alignSelf: 'center' }}>{avatar}</Box>
        <Typography
          component="span"
          variant="body2"
          noWrap
          sx={{ minWidth: 0, fontWeight: unread > 0 ? font.semibold : font.medium }}
        >
          {title}
        </Typography>
        <Typography
          component="span"
          variant="caption"
          sx={{ color: unread > 0 ? 'primary.main' : 'text.secondary', whiteSpace: 'nowrap' }}
        >
          {when ? shortWhen(when) : ''}
        </Typography>
        <Typography
          component="span"
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ gridColumn: '2 / span 2', minWidth: 0 }}
        >
          {subtitle}
        </Typography>
        <Typography
          component="span"
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ minWidth: 0 }}
        >
          {preview}
        </Typography>
        {unread > 0 ? <CountBadge count={unread} label={unreadLabel(unread)} /> : <span />}
      </Box>
    </li>
  );
}

/** En-tête de la conversation : interlocuteur et élève, une seule fois. */
export function ChatHeader({
  backTo,
  avatar,
  title,
  subtitle,
  aside,
}: {
  backTo: string;
  avatar?: ReactNode;
  title: string;
  subtitle: ReactNode;
  aside?: ReactNode;
}) {
  return (
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
      <Tooltip title={t('Retour aux conversations')}>
        <IconButton
          component={RouterLink}
          to={backTo}
          aria-label={t('Retour aux conversations')}
          sx={{ display: { md: 'none' } }}
        >
          <ArrowLeft size={icon.md} strokeWidth={icon.stroke} aria-hidden="true" />
        </IconButton>
      </Tooltip>
      {avatar}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle1" component="h2" noWrap sx={{ fontWeight: font.semibold }}>
          {title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ overflowWrap: 'anywhere' }}
        >
          {subtitle}
        </Typography>
      </Box>
      {aside}
    </Box>
  );
}

/** Zone défilante des messages, ouverte sur le dernier (ou sur `anchorId`). */
export function MessageScroller({
  children,
  anchorId,
  count,
}: {
  children: ReactNode;
  anchorId?: string;
  count: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const target = anchorId
      ? box.querySelector<HTMLElement>(`[data-message-id="${anchorId}"]`)
      : null;
    if (target) target.scrollIntoView?.({ block: 'center' });
    else box.scrollTop = box.scrollHeight;
  }, [anchorId, count]);
  return (
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
      {children}
    </Box>
  );
}

/** Liste chronologique avec un séparateur à chaque nouveau jour. */
export function DayList<T extends { id: string }>({
  items,
  dateOf,
  label,
  render,
}: {
  items: T[];
  dateOf: (item: T) => string;
  label: string;
  render: (item: T, index: number) => ReactNode;
}) {
  return (
    <Box
      component="ol"
      aria-label={label}
      sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}
    >
      {items.map((item, index) => {
        const day = dayLabel(dateOf(item));
        const showDay = index === 0 || dayLabel(dateOf(items[index - 1]!)) !== day;
        return (
          <Fragment key={item.id}>
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
            <Box component="li" sx={{ display: 'grid' }}>
              {render(item, index)}
            </Box>
          </Fragment>
        );
      })}
    </Box>
  );
}

// ------------------------------------------------------------------ Bulles

/** État de modération de ses propres messages, vu par leur auteur. */
export const OWN_STATUS: Record<
  CommunicationStatus,
  { label: string; tone: Tone; icon: LucideIcon }
> = {
  DRAFT: { label: t('Brouillon'), tone: 'neutral', icon: FilePen },
  PENDING_ADMIN_VALIDATION: { label: t('En attente de validation'), tone: 'warning', icon: Clock },
  APPROVED: { label: t('Transmis'), tone: 'success', icon: CheckCheck },
  RETURNED_FOR_CORRECTION: { label: t('À corriger'), tone: 'info', icon: PenLine },
  REJECTED: { label: t('Rejeté'), tone: 'error', icon: Ban },
  CANCELLED: { label: t('Annulé'), tone: 'neutral', icon: CircleSlash },
  SENT: { label: t('Envoyé'), tone: 'success', icon: CheckCheck },
};

/**
 * Bulle d'un message : à droite pour ses propres messages (avec leur état), à gauche pour les messages
 * reçus, précédés du nom de l'expéditeur (D7 : « L'école » pour le parent).
 */
export function ConversationBubble({
  message: m,
  actions,
  showStatus = m.mine,
}: {
  message: Message;
  actions?: ReactNode;
  /** État visible : ses propres messages, et tous les messages pour l'administration. */
  showStatus?: boolean;
}) {
  const status = OWN_STATUS[m.status];
  const own = m.mine;
  const authorLabel = own ? t('Vous') : m.authorLabel;
  const decisionReason = m.validation?.decisionReason ?? null;
  return (
    <Box
      component="article"
      data-message-id={m.id}
      aria-label={t('Message de {author}, {date}', {
        author: authorLabel,
        date: dayLabel(m.createdAt),
      })}
      sx={(theme) => {
        const tk = tokensOf(theme);
        return {
          justifySelf: own ? 'end' : 'start',
          maxWidth: { xs: '92%', sm: '78%', lg: '68%' },
          px: { xs: 1.5, sm: 2 },
          py: 1.25,
          display: 'grid',
          gap: 1,
          bgcolor: own ? tk.accent.soft : tk.surface,
          border: `1px solid ${own ? tk.accent.border : tk.border}`,
          boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
          // Coin resserré du côté de l'auteur, comme une messagerie.
          borderRadius: own ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
          animation: `${fadeIn} ${motion.base}ms ${motion.easing}`,
          ...reducedMotion,
        };
      }}
    >
      {!own && (
        <Typography
          variant="caption"
          component="p"
          sx={{ fontWeight: font.semibold }}
          aria-hidden="true"
        >
          {m.authorLabel}
        </Typography>
      )}
      {m.text && (
        <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text}</Typography>
      )}
      {m.voice && (
        <VoicePlayer
          key={m.voice.fileId}
          src={`/api/files/${m.voice.fileId}`}
          durationSeconds={m.voice.durationSeconds ?? undefined}
        />
      )}
      {decisionReason && (m.status === 'RETURNED_FOR_CORRECTION' || m.status === 'REJECTED') && (
        <Box
          sx={(theme) => ({
            px: 1.25,
            py: 0.75,
            borderRadius: `${radius.control}px`,
            borderLeft: `3px solid ${tokensOf(theme).border}`,
            bgcolor: tokensOf(theme).surface,
          })}
        >
          <Typography variant="caption" component="p" sx={{ fontWeight: font.semibold }}>
            {m.status === 'REJECTED' ? t('Motif du rejet') : t('Motif du retour')}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {decisionReason}
          </Typography>
        </Box>
      )}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: showStatus ? 'space-between' : 'flex-end',
          columnGap: 1,
          rowGap: 0.5,
        }}
      >
        {showStatus && (
          <Badge tone={status.tone} icon={status.icon}>
            {status.label}
          </Badge>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          <Box component="span" sx={visuallyHidden}>
            {authorLabel} —{' '}
          </Box>
          {timeOf(m.createdAt)}
          {m.readAt && own ? ` · ${t('lu')}` : ''}
        </Typography>
      </Box>
      {actions}
    </Box>
  );
}

// ------------------------------------------------------------------ Saisie

const MESSAGE_MAX = 2000;

/**
 * Saisie d'un message : un vocal, un texte, ou les deux (017, FR-007). L'enregistreur vient en premier.
 * `onSend` renvoie une promesse : la saisie est vidée si elle réussit.
 */
export function MessageComposer({
  onSend,
  hint,
  initialText = '',
  submitLabel = t('Envoyer'),
  onCancel,
  disabled = false,
}: {
  onSend: (input: { text: string; recording: VoiceRecording | null }) => Promise<void>;
  hint: string;
  initialText?: string;
  submitLabel?: string;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  const { voiceMaxSeconds } = useClientSettings();
  const [text, setText] = useState(initialText);
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialText) field.current?.focus();
  }, [initialText]);

  async function submit(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed && !recording) {
      setError(t('Écrivez un message ou enregistrez un message vocal avant d’envoyer.'));
      field.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSend({ text: trimmed, recording });
      setText('');
      setRecording(null);
    } catch (e) {
      setError(
        e instanceof Error && e.message ? e.message : t('Le message n’a pas pu être envoyé.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      component="form"
      aria-label={submitLabel}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      sx={{ display: 'grid', gap: 1, p: { xs: 1.25, sm: 2 }, borderTop: 1, borderColor: 'divider' }}
    >
      <TextField
        inputRef={field}
        multiline
        minRows={2}
        maxRows={6}
        size="small"
        label={t('Votre message')}
        value={text}
        disabled={disabled || busy}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        slotProps={{ htmlInput: { maxLength: MESSAGE_MAX } }}
      />
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <VoiceRecorder
          maxSeconds={voiceMaxSeconds}
          value={recording}
          onChange={setRecording}
          disabled={disabled || busy}
        />
        <Box sx={{ display: 'flex', gap: 0.75, ml: 'auto' }}>
          {onCancel && (
            <Button color="inherit" onClick={onCancel} disabled={busy}>
              {t('Annuler')}
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            loading={busy}
            disabled={disabled}
            startIcon={<Send size={icon.sm} aria-hidden="true" />}
          >
            {submitLabel}
          </Button>
        </Box>
      </Box>
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      <Typography variant="caption" color="text.secondary">
        {hint}
      </Typography>
    </Box>
  );
}
