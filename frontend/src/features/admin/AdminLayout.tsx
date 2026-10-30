import Box from '@mui/material/Box';
import {
  Activity,
  BookOpen,
  Building2,
  GraduationCap,
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
import { useCurrentUser } from '../auth/useCurrentUser';

const SECTIONS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/admin/suivi', label: 'Suivi des gardes', icon: Activity },
  { to: '/admin/comptes', label: 'Comptes', icon: Users },
  { to: '/admin/categories', label: 'Catégories', icon: Tags },
  { to: '/admin/consignes', label: 'Consignes', icon: BookOpen },
  { to: '/admin/groupes', label: 'Groupes', icon: UsersRound },
  { to: '/admin/etages', label: 'Étages', icon: Building2 },
  { to: '/admin/classes', label: 'Classes', icon: School },
  { to: '/admin/eleves', label: 'Élèves', icon: GraduationCap },
  { to: '/admin/reglages', label: 'Réglages', icon: SlidersHorizontal },
  { to: '/admin/journal', label: 'Journal d’audit', icon: ScrollText },
];

/** Espace « Administrateur » (US8, FR-004c) : réservé au super administrateur ; le serveur refuse aussi tout autre rôle. */
export function AdminLayout() {
  const me = useCurrentUser();
  if (me.isPending) return <LoadingState />;
  if (me.data?.role !== 'SUPER_ADMIN') {
    return <ErrorState message="Accès réservé au super administrateur." />;
  }

  return (
    <Box>
      <PageHeader
        title="Administrateur"
        description="Suivi des gardes, comptes, catégories, consignes, groupes, étages, classes, élèves, réglages et journal d’audit de l’établissement."
      />
      <Box
        component="nav"
        aria-label="Sections de l’espace Administrateur"
        sx={{
          mb: 3,
          borderBottom: 1,
          borderColor: 'divider',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', gap: 0.5 }}>
          {SECTIONS.map(({ to, label, icon: Icon }) => (
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
