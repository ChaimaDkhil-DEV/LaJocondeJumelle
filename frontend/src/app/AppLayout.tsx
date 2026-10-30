import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  School,
  Settings,
  SquarePen,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router';
import type { Me } from '../api/types';
import { AppLogo } from '../components/AppLogo';
import { IconAction } from '../components/IconAction';
import { visuallyHidden } from '../components/a11y';
import { Person } from '../components/UserAvatar';
import { font, fontSize, icon, layout, motion, radius, tokensOf } from '../design/tokens';
import { ROLE_LABELS } from '../features/admin/labels';
import { useCurrentUser, useLogout } from '../features/auth/useCurrentUser';
import { NotificationCenter } from '../features/notifications/NotificationCenter';
import { SocketProvider } from '../features/notifications/SocketProvider';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Chemins pour lesquels l'entrée est mise en évidence. */
  matches: (pathname: string) => boolean;
  /** Chemins où l'entrée désigne la page courante (`aria-current`) ; par défaut, son seul `to`. */
  current?: (pathname: string) => boolean;
}

/** Tableau de bord : page d'accueil du super administrateur (seul rôle autorisé par l'API). */
const DASHBOARD_ITEM: NavItem = {
  to: '/',
  label: 'Tableau de bord',
  icon: LayoutDashboard,
  matches: (p) => p === '/',
};

/**
 * « Mes demandes » (`/demandes`) ; pour les rôles sans tableau de bord, c'est aussi la page
 * d'accueil `/`.
 */
function requestsItem(isHome: boolean): NavItem {
  const current = (p: string) => p === '/demandes' || (isHome && p === '/');
  return {
    to: '/demandes',
    label: 'Mes demandes',
    icon: Inbox,
    current,
    matches: (p) => current(p) || (p.startsWith('/demandes/') && p !== '/demandes/nouvelle'),
  };
}

/** Entrées de navigation communes, après « Mes demandes ». */
export const NAV_ITEMS: NavItem[] = [
  {
    to: '/demandes/nouvelle',
    label: 'Nouvelle demande',
    icon: SquarePen,
    matches: (p) => p === '/demandes/nouvelle',
  },
];

/** Gardes de classe : admins, super administrateur, membres des groupes Surveillants ou Enseignants (FR-023b). */
export function canSeeCoverage(me: Me | undefined): boolean {
  if (!me) return false;
  return (
    me.role === 'ADMIN' ||
    me.role === 'SUPER_ADMIN' ||
    Boolean(me.isTeacher) ||
    Boolean(me.isSupervisor)
  );
}

const COVERAGE_ITEM: NavItem = {
  to: '/gardes',
  label: 'Gardes',
  icon: School,
  matches: (p) => p.startsWith('/gardes'),
};

/** Entrée réservée au super administrateur (le serveur refuse aussi /api/admin aux autres rôles). */
const ADMIN_ITEM: NavItem = {
  to: '/admin',
  label: 'Administrateur',
  icon: Settings,
  matches: (p) => p.startsWith('/admin'),
};

/** Lien d'évitement : invisible jusqu'à ce qu'il reçoive le focus clavier. */
function SkipLink() {
  return (
    <Link
      href="#contenu"
      sx={{
        position: 'absolute',
        left: 8,
        top: -48,
        zIndex: (theme) => theme.zIndex.appBar + 1,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        px: 2,
        py: 1,
        '&:focus': { top: 8 },
      }}
    >
      Aller au contenu
    </Link>
  );
}

function Brand() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <AppLogo />
      <Typography component="p" sx={{ fontSize: fontSize.sm, fontWeight: font.semibold, lineHeight: 1.25 }}>
        La Joconde Jumelle
      </Typography>
    </Box>
  );
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <Box component="nav" aria-label="Navigation principale">
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
        {items.map((item) => {
          const active = item.matches(pathname);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Box
                component={RouterLink}
                to={item.to}
                onClick={onNavigate}
                aria-current={active && (item.current ?? ((p: string) => p === item.to))(pathname) ? 'page' : undefined}
                sx={(theme) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  minHeight: 42,
                  px: 1.75,
                  // Élément actif : pilule indigo pâle, texte et icône indigo.
                  borderRadius: `${radius.round}px`,
                  textDecoration: 'none',
                  fontSize: fontSize.sm,
                  fontWeight: active ? font.semibold : font.medium,
                  color: active ? tokensOf(theme).accent.text : tokensOf(theme).textSecondary,
                  bgcolor: active ? tokensOf(theme).accent.soft : 'transparent',
                  transition: `background-color ${motion.fast}ms, color ${motion.fast}ms`,
                  '& svg': {
                    color: active ? tokensOf(theme).accent.main : tokensOf(theme).textMuted,
                    flex: 'none',
                  },
                  '&:hover': {
                    bgcolor: active ? tokensOf(theme).accent.soft : tokensOf(theme).surfaceMuted,
                    color: active ? tokensOf(theme).accent.text : tokensOf(theme).text,
                  },
                  '@media (pointer: coarse)': { minHeight: 44 },
                })}
              >
                <Icon size={icon.md} aria-hidden="true" />
                {item.label}
              </Box>
            </li>
          );
        })}
      </Box>
    </Box>
  );
}

/**
 * Bloc profil (nom et rôle) : lien vers « Mon profil » (spec 005). Le préfixe masqué complète le
 * nom accessible sans remplacer le texte visible (WCAG 2.5.3).
 */
function ProfileLink({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const active = pathname === '/profil';
  return (
    <Box
      component={RouterLink}
      to="/profil"
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      sx={(theme) => ({
        display: 'block',
        px: 1,
        py: 0.75,
        borderRadius: `${radius.control}px`,
        color: 'inherit',
        textDecoration: 'none',
        bgcolor: active ? tokensOf(theme).surfaceMuted : 'transparent',
        transition: `background-color ${motion.fast}ms`,
        '&:hover': { bgcolor: tokensOf(theme).surfaceMuted },
      })}
    >
      <Box component="span" sx={visuallyHidden}>
        Mon profil :{' '}
      </Box>
      <Person
        name={me.displayName}
        id={me.id}
        size={32}
        secondary={
          <>
            {/* Nom et rôle sont deux span en ligne : sans séparateur, ils seraient lus d'un seul mot. */}
            <Box component="span" sx={visuallyHidden}>
              ,
            </Box>{' '}
            {ROLE_LABELS[me.role]}
          </>
        }
      />
    </Box>
  );
}

export function AppLayout() {
  const navigate = useNavigate();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const me = useCurrentUser();
  const logout = useLogout();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showCoverage = canSeeCoverage(me.data);
  const superAdmin = me.data?.role === 'SUPER_ADMIN';
  const navItems = [
    ...(superAdmin ? [DASHBOARD_ITEM] : []),
    requestsItem(!superAdmin),
    ...NAV_ITEMS,
    ...(showCoverage ? [COVERAGE_ITEM] : []),
    ...(superAdmin ? [ADMIN_ITEM] : []),
  ];

  function handleLogout(): void {
    logout.mutate(undefined, { onSettled: () => navigate('/connexion', { replace: true }) });
  }

  return (
    <SocketProvider>
      <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', overflowX: 'hidden' }}>
        <SkipLink />
        {desktop ? (
          <Box
            component="aside"
            sx={{
              position: 'fixed',
              inset: '0 auto 0 0',
              width: layout.sidebar,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              px: 2,
              py: 2.5,
              bgcolor: 'background.paper',
              boxShadow: (t) => `1px 0 0 ${tokensOf(t).border}, 4px 0 24px rgba(35, 42, 89, 0.04)`,
              zIndex: (t) => t.zIndex.appBar,
            }}
          >
            <Box
              component="header"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                pl: 0.5,
              }}
            >
              <Brand />
              <NotificationCenter />
            </Box>
            <NavList items={navItems} />
            <Box
              sx={{
                mt: 'auto',
                display: 'grid',
                gap: 1.5,
                pt: 2,
                borderTop: 1,
                borderColor: 'divider',
              }}
            >
              {me.data && <ProfileLink me={me.data} />}
              <Button
                onClick={handleLogout}
                startIcon={<LogOut size={icon.md} aria-hidden="true" />}
                sx={{ justifyContent: 'flex-start', px: 1.25 }}
              >
                Se déconnecter
              </Button>
            </Box>
          </Box>
        ) : (
          <>
            <Box
              component="header"
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: (t) => t.zIndex.appBar,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                minHeight: 56,
                px: 1,
                bgcolor: 'background.paper',
                boxShadow: (t) => `0 1px 0 ${tokensOf(t).border}, 0 4px 16px rgba(35, 42, 89, 0.04)`,
              }}
            >
              <IconAction
                icon={Menu}
                label="Ouvrir le menu"
                tooltip="Menu"
                onClick={() => setDrawerOpen(true)}
              />
              <Box sx={{ flexGrow: 1, minWidth: 0, ml: 0.5 }}>
                <Brand />
              </Box>
              <NotificationCenter />
              <IconAction icon={LogOut} label="Se déconnecter" onClick={handleLogout} />
            </Box>
            <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
              <Box
                sx={{
                  width: 280,
                  maxWidth: '85vw',
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  height: '100%',
                }}
              >
                <Brand />
                <NavList items={navItems} onNavigate={() => setDrawerOpen(false)} />
                {me.data && (
                  <Box sx={{ mt: 'auto', pt: 2, borderTop: 1, borderColor: 'divider' }}>
                    <ProfileLink me={me.data} onNavigate={() => setDrawerOpen(false)} />
                  </Box>
                )}
              </Box>
            </Drawer>
          </>
        )}
        <Box
          component="main"
          id="contenu"
          tabIndex={-1}
          sx={{ ml: { md: `${layout.sidebar}px` }, '&:focus': { outline: 'none' } }}
        >
          <Box
            sx={{
              maxWidth: layout.content,
              mx: 'auto',
              px: { xs: 2, sm: 3, md: 4 },
              py: { xs: 3, md: 4 },
            }}
          >
            <Outlet />
          </Box>
        </Box>
      </Box>
    </SocketProvider>
  );
}
