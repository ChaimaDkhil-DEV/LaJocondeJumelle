import Box from '@mui/material/Box';
import {
  Activity,
  BookOpen,
  Building2,
  Contact,
  BookUser,
  GraduationCap,
  HeartHandshake,
  Layers,
  School,
  ScrollText,
  SlidersHorizontal,
  Tags,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { font, fontSize, icon, motion, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import type { Role } from '../../api/types';
import { useCurrentUser } from '../auth/useCurrentUser';
import { canUseAdministrationSpace, isSuperAdmin } from './access';

const SUPER: Role[] = ['SUPER_ADMIN'];
const BOTH: Role[] = ['SUPER_ADMIN', 'ADMIN'];

/** Sections et rôles qui les voient (011, contracts/ui.md) ; le serveur vérifie aussi chaque route. */
const SECTIONS: Array<{ to: string; label: string; icon: LucideIcon; roles: Role[] }> = [
  { to: '/admin/suivi', label: t('Suivi des gardes'), icon: Activity, roles: SUPER },
  { to: '/admin/comptes', label: t('Comptes'), icon: Users, roles: SUPER },
  { to: '/admin/categories', label: t('Catégories'), icon: Tags, roles: SUPER },
  { to: '/admin/consignes', label: t('Consignes'), icon: BookOpen, roles: SUPER },
  { to: '/admin/groupes', label: t('Groupes'), icon: UsersRound, roles: SUPER },
  { to: '/admin/etages', label: t('Étages'), icon: Building2, roles: BOTH },
  { to: '/admin/niveaux', label: t('Niveaux'), icon: Layers, roles: BOTH },
  { to: '/admin/classes', label: t('Classes'), icon: School, roles: BOTH },
  { to: '/admin/eleves', label: t('Élèves'), icon: GraduationCap, roles: BOTH },
  { to: '/admin/representants', label: t('Représentants'), icon: HeartHandshake, roles: BOTH },
  { to: '/admin/classes-enseignants', label: t('Classes des enseignants'), icon: BookUser, roles: BOTH },
  { to: '/admin/employes', label: t('Employés'), icon: Contact, roles: ['ADMIN'] },
  { to: '/admin/reglages', label: t('Réglages'), icon: SlidersHorizontal, roles: SUPER },
  { to: '/admin/journal', label: t('Journal d’audit'), icon: ScrollText, roles: SUPER },
];

/**
 * Espace « Administrateur » (US8, FR-004c ; 011) : le super administrateur voit toutes les sections, l'admin
 * les données de référence et la liste des employés ; les autres rôles sont refusés, comme par le serveur.
 */
export function AdminLayout() {
  const me = useCurrentUser();
  if (me.isPending) return <LoadingState />;
  if (!me.data || !canUseAdministrationSpace(me.data)) {
    return <ErrorState message={t('Accès réservé à l’administration.')} />;
  }
  const role = me.data.role;
  const sections = SECTIONS.filter((s) => s.roles.includes(role));

  return (
    <Box>
      <PageHeader
        title={t('Administrateur')}
        description={
          isSuperAdmin(me.data)
            ? t('Suivi des gardes, comptes, catégories, consignes, groupes, étages, classes, élèves, réglages et journal d’audit de l’établissement.')
            : t('Étages, niveaux, classes, élèves et liste des employés de l’établissement.')
        }
      />
      <Box
        component="nav"
        aria-label={t('Sections de l’espace Administrateur')}
        sx={{
          mb: 3,
          borderBottom: 1,
          borderColor: 'divider',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', gap: 0.5 }}>
          {sections.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Box
                component={NavLink}
                to={to}
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
                  '&.active': {
                    color: tokensOf(theme).text,
                    borderBottomColor: tokensOf(theme).accent.main,
                  },
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
