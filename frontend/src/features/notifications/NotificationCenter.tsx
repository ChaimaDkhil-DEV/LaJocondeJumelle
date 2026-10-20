import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  AlarmClock,
  Ban,
  CalendarClock,
  Copy,
  Hourglass,
  Pencil,
  Sunrise,
  TriangleAlert,
  UsersRound,
  Bell,
  BellOff,
  CheckCheck,
  CircleX,
  FilePlus,
  Lock,
  MessageSquare,
  DoorOpen,
  Hand,
  LifeBuoy,
  RefreshCw,
  RotateCcw,
  School,
  Siren,
  Timer,
  UserCheck,
  UserMinus,
  UserRound,
  type LucideIcon,
  UserRoundX,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { visuallyHidden } from '../../components/a11y';
import { formatRelative } from '../../components/format';
import { font, icon, shadow, tokensOf } from '../../design/tokens';
import {
  NOTIFICATION_LABELS,
  requestPath,
  useMarkRead,
  useUnreadNotifications,
  type NotificationItem,
  type NotificationType,
} from './api';
import { useRealtime } from './SocketProvider';
import { useUrgentSound } from './useUrgentSound';

const NOTIFICATION_ICONS: Record<NotificationType, LucideIcon> = {
  REQUEST_NEW: FilePlus,
  MESSAGE_NEW: MessageSquare,
  ASSIGNED: UserRound,
  STATUS_CHANGED: RefreshCw,
  URGENT: Siren,
  TO_CORRECT: RotateCcw,
  REJECTED: CircleX,
  CANCELLED: Ban,
  OVERDUE: AlarmClock,
  CLOSED: Lock,
  COVERAGE_NEW: School,
  COVERAGE_TAKEN: Hand,
  COVERAGE_ACCEPTED: UserCheck,
  COVERAGE_PRESENCE: DoorOpen,
  COVERAGE_RELEASED: UserMinus,
  COVERAGE_RELIEF_REQUESTED: LifeBuoy,
  COVERAGE_LATE: AlarmClock,
  COVERAGE_UNFILLED: AlarmClock,
  COVERAGE_EXTENDED: Timer,
  COVERAGE_RELIEVED: Lock,
  COVERAGE_REQUESTED: CalendarClock,
  COVERAGE_EMPTY_CLASS: School,
  COVERAGE_TAKEOVER_EXPIRED: AlarmClock,
  COVERAGE_ESCALATED: Siren,
  COVERAGE_MORNING_REMINDER: Sunrise,
  COVERAGE_CLOSE_REMINDER: Hourglass,
  COVERAGE_DUPLICATE: Copy,
  COVERAGE_SUPPORT_REMINDER: UsersRound,
  COVERAGE_DOUBLE_ASSIGNMENT: TriangleAlert,
  COVERAGE_LIFTED: UserMinus,
  COVERAGE_UPDATED: Pencil,
  UNASSIGNED: UserRoundX,
};

function UrgentMark() {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        color: tokensOf(theme).error.text,
        fontWeight: font.medium,
      })}
    >
      <Siren size={icon.sm - 2} aria-hidden="true" />
      Urgent
    </Box>
  );
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const urgent = item.priority === 'URGENT';
  const Icon = NOTIFICATION_ICONS[item.type];
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', width: '100%', minWidth: 0 }}>
      <Box
        aria-hidden="true"
        sx={(theme) => ({
          width: 32,
          height: 32,
          flex: 'none',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: urgent ? tokensOf(theme).error.soft : tokensOf(theme).accent.soft,
          color: urgent ? tokensOf(theme).error.main : tokensOf(theme).accent.main,
        })}
      >
        <Icon size={icon.sm} />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: font.medium, overflowWrap: 'anywhere' }}>
          {urgent && (
            <>
              <UrgentMark />{' '}
            </>
          )}
          {NOTIFICATION_LABELS[item.type]} — {item.request.title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {item.request.reference} ·{' '}
          <time dateTime={item.createdAt}>{formatRelative(item.createdAt)}</time>
        </Typography>
      </Box>
      {/* Non lue : pastille discrète (les notifications listées ici sont toutes non lues). */}
      <Box
        aria-hidden="true"
        sx={{
          width: 8,
          height: 8,
          mt: 1,
          flex: 'none',
          borderRadius: '50%',
          bgcolor: 'primary.main',
        }}
      />
    </Box>
  );
}

/**
 * Centre de notifications : compteur des non lues, liste, « tout marquer comme lu », annonces
 * aux lecteurs d'écran (polie, ou immédiate pour une urgence) et bandeau à l'arrivée d'une notification.
 */
export function NotificationCenter() {
  const navigate = useNavigate();
  const menuId = useId();
  const unread = useUnreadNotifications();
  const markRead = useMarkRead();
  const { latest, dismissLatest } = useRealtime();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const sound = useUrgentSound();
  const { play } = sound;

  // Signal sonore facultatif, en plus du bandeau et de l'annonce (jamais seul porteur de l'information).
  useEffect(() => {
    if (latest?.priority === 'URGENT') play();
  }, [latest, play]);

  const total = unread.data?.unreadTotal ?? 0;
  const items = unread.data?.items ?? [];
  const latestUrgent = latest?.priority === 'URGENT';
  const latestText = latest ? `${NOTIFICATION_LABELS[latest.type]} : ${latest.title}` : '';

  function open(item: NotificationItem): void {
    setAnchor(null);
    markRead.mutate({ ids: [item.id] });
    navigate(requestPath(item.request.id, item.request.kind));
  }

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          aria-label={`Notifications (${total} non lue${total > 1 ? 's' : ''})`}
          aria-haspopup="menu"
          aria-controls={anchor ? menuId : undefined}
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          <Badge badgeContent={total} color="error" max={99} overlap="circular">
            <Bell size={icon.lg} aria-hidden="true" />
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        id={menuId}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          list: { 'aria-label': 'Notifications' },
          paper: { sx: { width: 380, maxWidth: 'calc(100vw - 16px)' } },
        }}
      >
        {items.length === 0 && (
          <MenuItem disabled sx={{ '&.Mui-disabled': { opacity: 1 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
              <BellOff size={icon.sm} aria-hidden="true" />
              Aucune notification non lue
            </Box>
          </MenuItem>
        )}
        {items.map((item) => (
          <MenuItem
            key={item.id}
            onClick={() => open(item)}
            sx={{ whiteSpace: 'normal', alignItems: 'flex-start', py: 1.25 }}
          >
            <NotificationRow item={item} />
          </MenuItem>
        ))}
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          role="menuitemcheckbox"
          aria-checked={sound.enabled}
          onClick={() => sound.setEnabled(!sound.enabled)}
          sx={{ color: 'text.secondary', gap: 1 }}
        >
          {sound.enabled ? (
            <Volume2 size={icon.sm} aria-hidden="true" />
          ) : (
            <VolumeX size={icon.sm} aria-hidden="true" />
          )}
          Signal sonore des urgences : {sound.enabled ? 'activé' : 'désactivé'}
        </MenuItem>
        {items.length > 0 && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              markRead.mutate({ all: true });
            }}
            sx={{ color: 'text.secondary', gap: 1 }}
          >
            <CheckCheck size={icon.sm} aria-hidden="true" />
            Tout marquer comme lu
          </MenuItem>
        )}
      </Menu>

      {/* Annonces aux lecteurs d'écran : polie, ou immédiate (assertive) pour une urgence. */}
      <Box data-testid="annonce-polie" aria-live="polite" sx={visuallyHidden}>
        {latest && !latestUrgent ? latestText : ''}
      </Box>
      <Box data-testid="annonce-urgente" aria-live="assertive" sx={visuallyHidden}>
        {latest && latestUrgent ? latestText : ''}
      </Box>

      <Snackbar
        open={Boolean(latest)}
        autoHideDuration={latestUrgent ? null : 8000}
        onClose={(_e, reason) => reason !== 'clickaway' && dismissLatest()}
      >
        {latest ? (
          <Alert
            severity={latestUrgent ? 'error' : 'info'}
            variant={latestUrgent ? 'filled' : 'standard'}
            role={latestUrgent ? 'alert' : 'status'}
            icon={
              latestUrgent ? (
                <Siren size={icon.lg} data-testid="notification-urgente-icone" />
              ) : undefined
            }
            onClose={dismissLatest}
            action={
              <Button
                color="inherit"
                size="small"
                component={RouterLink}
                to={requestPath(latest.requestId, latest.kind)}
                onClick={dismissLatest}
                sx={{
                  color: 'inherit',
                  '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
                }}
              >
                Voir
              </Button>
            }
            sx={{
              width: '100%',
              maxWidth: 480,
              boxShadow: shadow,
              ...(!latestUrgent && { bgcolor: 'background.paper' }),
            }}
          >
            {latestUrgent && <strong>Urgent — </strong>}
            {NOTIFICATION_LABELS[latest.type]} : {latest.title}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
