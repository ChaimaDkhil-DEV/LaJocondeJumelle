import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import { Camera, Pencil, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Badge } from '../../components/Badge';
import { formatDateTime, formatRelative } from '../../components/format';
import { IconAction } from '../../components/IconAction';
import { UserAvatar } from '../../components/UserAvatar';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';
import { formatDurationMs, type DurationStats, type EmployeeStats } from './dashboardApi';
import { ROLE_LABELS } from './labels';

/** Petite carte d'indicateur du panneau : libellé gris, valeur, précision facultative. */
function Kpi({ label, value, detail, tone }: { label: string; value: ReactNode; detail?: string; tone?: 'error' }) {
  return (
    <Box
      sx={(theme) => ({
        p: 1.5,
        borderRadius: '12px',
        bgcolor: tokensOf(theme).surfaceMuted,
        border: `1px solid ${tokensOf(theme).border}`,
        minWidth: 0,
      })}
    >
      <Typography component="dt" sx={(theme) => ({ fontSize: fontSize.xs, color: tokensOf(theme).textSecondary })}>
        {label}
      </Typography>
      <Box
        component="dd"
        sx={(theme) => ({
          m: 0,
          mt: 0.25,
          fontSize: fontSize.lg,
          fontWeight: font.semibold,
          fontVariantNumeric: 'tabular-nums',
          color: tone === 'error' ? tokensOf(theme).error.text : tokensOf(theme).text,
          overflowWrap: 'anywhere',
        })}
      >
        {value}
        {detail && (
          <Box component="span" sx={(theme) => ({ display: 'block', fontSize: fontSize.xs, fontWeight: font.regular, color: tokensOf(theme).textSecondary })}>
            {detail}
          </Box>
        )}
      </Box>
    </Box>
  );
}

const duration = (d: DurationStats) => (d.count === 0 ? 'Aucune donnée' : formatDurationMs(d.avgMs));
const sample = (d: DurationStats) => (d.count === 0 ? undefined : `n = ${d.count}`);

interface EmployeeDrawerProps {
  employee: EmployeeStats | null;
  onClose: () => void;
  /** Absent : action indisponible (compte non chargé). */
  onEdit?: () => void;
  onChangePhoto: () => void;
}

/**
 * Détail d'un employé, ouvert au clic sur sa ligne : les indicateurs secondaires (créées, reçues,
 * délais moyens, dernière action) en petites cartes, et les actions du compte.
 */
export function EmployeeDrawer({ employee: e, onClose, onEdit, onChangePhoto }: EmployeeDrawerProps) {
  const titleId = useId();
  return (
    <Drawer
      anchor="right"
      open={e !== null}
      onClose={onClose}
      slotProps={{ paper: { 'aria-labelledby': titleId, sx: { width: { xs: '100%', sm: 440 }, p: { xs: 2, sm: 3 }, display: 'grid', alignContent: 'start', gap: 2.5 } } }}
    >
      {e && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <UserAvatar user={{ id: e.user.id, displayName: e.user.displayName }} size={64} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography id={titleId} component="h2" variant="h6" sx={{ overflowWrap: 'anywhere' }}>
                {e.user.displayName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {e.user.jobTitle ? `${e.user.jobTitle} · ${ROLE_LABELS[e.user.role]}` : ROLE_LABELS[e.user.role]}
              </Typography>
              <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                <Badge tone={e.user.active ? 'success' : 'error'}>{e.user.active ? 'Actif' : 'Désactivé'}</Badge>
                {e.overdueNow > 0 && <Badge tone="error">{e.overdueNow} en retard</Badge>}
              </Box>
            </Box>
            <IconAction icon={X} label="Fermer le détail" tooltip="Fermer" onClick={onClose} />
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {onEdit && (
              <Button variant="outlined" size="small" startIcon={<Pencil size={icon.sm} aria-hidden="true" />} onClick={onEdit}>
                Modifier
              </Button>
            )}
            <Button variant="outlined" size="small" startIcon={<Camera size={icon.sm} aria-hidden="true" />} onClick={onChangePhoto}>
              Changer la photo
            </Button>
          </Box>

          <Box component="section" aria-label="Activité sur la période" sx={{ display: 'grid', gap: 1 }}>
            <Typography component="h3" sx={{ fontSize: fontSize.sm, fontWeight: font.semibold }}>
              Activité sur la période
            </Typography>
            <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <Kpi label="Créées" value={e.created} />
              <Kpi label="Reçues" value={e.assigned} detail="Affectées actuellement" />
              <Kpi label="À prendre en charge" value={e.pendingTakeover} />
              <Kpi label="En cours" value={e.inProgress} />
              <Kpi label="Terminées" value={e.done} />
              <Kpi label="En retard" value={e.overdueNow} tone={e.overdueNow > 0 ? 'error' : undefined} detail={e.overdueInPeriod > 0 ? `${e.overdueInPeriod} sur la période` : undefined} />
            </Box>
          </Box>

          <Box component="section" aria-label="Délais moyens" sx={{ display: 'grid', gap: 1 }}>
            <Typography component="h3" sx={{ fontSize: fontSize.sm, fontWeight: font.semibold }}>
              Délais moyens
            </Typography>
            <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <Kpi label="Prise en charge" value={duration(e.takeover)} detail={sample(e.takeover)} />
              <Kpi label="Traitement net" value={duration(e.resolution)} detail={sample(e.resolution)} />
            </Box>
          </Box>

          <Box component="dl" sx={{ m: 0, display: 'grid' }}>
            <Kpi
              label="Dernière action"
              value={e.lastActionAt ? formatRelative(e.lastActionAt) : 'Aucune'}
              detail={e.lastActionAt ? formatDateTime(e.lastActionAt) : undefined}
            />
          </Box>

          <Typography variant="body2" color="text.secondary">
            « Reçues » : demandes de la période actuellement affectées à l’employé. « Dernière action » : dernière action enregistrée sur une demande ;
            elle n’indique ni la présence ni la disponibilité de la personne.
          </Typography>
        </>
      )}
    </Drawer>
  );
}
