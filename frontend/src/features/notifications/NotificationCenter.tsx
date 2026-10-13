import NotificationsIcon from '@mui/icons-material/Notifications';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import { useId, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { formatDateTime } from '../../components/format';
import { NOTIFICATION_LABELS, useMarkRead, useUnreadNotifications, type NotificationItem } from './api';
import { useRealtime } from './SocketProvider';

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

function UrgentMark({ testId }: { testId?: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color: 'error.main', fontWeight: 700 }}>
      <PriorityHighIcon fontSize="small" aria-hidden="true" data-testid={testId} />
      Urgent
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

  const total = unread.data?.unreadTotal ?? 0;
  const items = unread.data?.items ?? [];
  const latestUrgent = latest?.priority === 'URGENT';
  const latestText = latest ? `${NOTIFICATION_LABELS[latest.type]} : ${latest.title}` : '';

  function open(item: NotificationItem): void {
    setAnchor(null);
    markRead.mutate({ ids: [item.id] });
    navigate(`/demandes/${item.request.id}`);
  }

  return (
    <>
      <IconButton
        color="inherit"
        aria-label={`Notifications (${total} non lue${total > 1 ? 's' : ''})`}
        aria-haspopup="menu"
        aria-controls={anchor ? menuId : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <Badge badgeContent={total} color="error" max={99}>
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Menu
        id={menuId}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ list: { 'aria-label': 'Notifications' }, paper: { sx: { maxWidth: 360, width: '100%' } } }}
      >
        {items.length === 0 && <MenuItem disabled>Aucune notification non lue</MenuItem>}
        {items.map((item) => (
          <MenuItem key={item.id} onClick={() => open(item)} sx={{ whiteSpace: 'normal', alignItems: 'flex-start' }}>
            <ListItemText
              primary={
                <>
                  {item.priority === 'URGENT' && (
                    <>
                      <UrgentMark />{' '}
                    </>
                  )}
                  {NOTIFICATION_LABELS[item.type]} — {item.request.title}
                </>
              }
              secondary={`${item.request.reference} · ${formatDateTime(item.createdAt)}`}
            />
          </MenuItem>
        ))}
        {items.length > 0 && <Divider />}
        {items.length > 0 && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              markRead.mutate({ all: true });
            }}
          >
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
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {latest ? (
          <Alert
            severity={latestUrgent ? 'error' : 'info'}
            variant={latestUrgent ? 'filled' : 'standard'}
            role={latestUrgent ? 'alert' : 'status'}
            icon={latestUrgent ? <PriorityHighIcon data-testid="notification-urgente-icone" /> : undefined}
            onClose={dismissLatest}
            action={
              <Button
                color="inherit"
                size="small"
                component={RouterLink}
                to={`/demandes/${latest.requestId}`}
                onClick={dismissLatest}
              >
                Voir
              </Button>
            }
            sx={{ width: '100%' }}
          >
            {latestUrgent && <strong>Urgent — </strong>}
            {NOTIFICATION_LABELS[latest.type]} : {latest.title}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
