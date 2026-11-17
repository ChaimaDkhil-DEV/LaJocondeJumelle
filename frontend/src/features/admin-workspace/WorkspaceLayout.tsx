import Box from '@mui/material/Box';
import { ArrowLeftRight, CircleCheck, FolderOpen, History, Inbox, LayoutDashboard, Loader, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { font, fontSize, icon, motion, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import { useCurrentUser } from '../auth/useCurrentUser';
import { hasWorkspace } from './access';

/** Rubriques de l'espace de travail (018, FR-024). */
const SECTIONS: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/espace', label: t('Tableau de bord'), icon: LayoutDashboard, end: true },
  { to: '/espace/file', label: t('File commune'), icon: Inbox },
  { to: '/espace/mes-demandes', label: t('Mes demandes'), icon: FolderOpen },
  { to: '/espace/en-cours', label: t('Demandes en cours'), icon: Loader },
  { to: '/espace/terminees', label: t('Demandes terminées'), icon: CircleCheck },
  { to: '/espace/collaboration', label: t('Collaboration'), icon: ArrowLeftRight },
  { to: '/espace/historique', label: t('Mon historique'), icon: History },
];

/**
 * Espace de travail de l'administrateur (018) : ses demandes, la file commune, son historique. Réservé
 * aux comptes Admin : l'interface ne fait que masquer, le serveur vérifie chaque route. Même barre de
 * rubriques que l'espace « Administrateur », défilable sur téléphone.
 */
export function WorkspaceLayout() {
  const me = useCurrentUser();
  if (me.isPending) return <LoadingState />;
  if (!hasWorkspace(me.data)) return <ErrorState message={t('Accès réservé aux administrateurs.')} />;

  return (
    <Box>
      <PageHeader title={t('Espace de travail')} description={t('La file commune, les demandes à votre charge et votre historique.')} />
      <Box
        component="nav"
        aria-label={t('Rubriques de l’espace de travail')}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider', overflowX: 'auto', scrollbarWidth: 'none' }}
      >
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', gap: 0.5 }}>
          {SECTIONS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <Box
                component={NavLink}
                to={to}
                end={end}
                sx={(theme) => ({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  minHeight: 44,
                  px: 1.5,
                  whiteSpace: 'nowrap',
                  textDecoration: 'none',
                  fontSize: fontSize.sm,
                  fontWeight: font.medium,
                  color: tokensOf(theme).textSecondary,
                  borderBottom: '2px solid transparent',
                  mb: '-1px',
                  transition: `color ${motion.fast}ms, border-color ${motion.fast}ms`,
                  '&:hover': { color: tokensOf(theme).text },
                  '&.active': { color: tokensOf(theme).text, borderBottomColor: tokensOf(theme).accent.main },
                  '&:focus-visible': { outlineOffset: -2 },
                })}
              >
                <Icon size={icon.sm} aria-hidden="true" />
                {label}
              </Box>
            </li>
          ))}
        </Box>
      </Box>
      <Outlet />
    </Box>
  );
}
