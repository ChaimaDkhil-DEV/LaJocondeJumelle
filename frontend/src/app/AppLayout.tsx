import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  ClipboardList,
  Inbox,
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
import { IconAction } from '../components/IconAction';
import { Person } from '../components/UserAvatar';
import { font, fontSize, icon, layout, motion, tokensOf } from '../design/tokens';
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
}

/** Entrées de navigation communes. */
export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Mes demandes',
    icon: Inbox,
    matches: (p) => p === '/' || (p.startsWith('/demandes/') && p !== '/demandes/nouvelle'),
  },
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
      <Box
        aria-hidden="true"
        sx={(theme) => ({
          width: 28,
          height: 28,
          flex: 'none',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: tokensOf(theme).accent.main,
          color: tokensOf(theme).accent.contrastText,
        })}
      >
        <ClipboardList size={icon.sm} />
      </Box>
      <Typography component="p" variant="subtitle2" noWrap>
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
                aria-current={active && pathname === item.to ? 'page' : undefined}
                sx={(theme) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  minHeight: 40,
                  px: 1.25,
                  borderRadius: 1,
                  textDecoration: 'none',
                  fontSize: fontSize.sm,
                  fontWeight: font.medium,
                  color: active ? tokensOf(theme).text : tokensOf(theme).textSecondary,
                  bgcolor: active ? tokensOf(theme).surfaceMuted : 'transparent',
                  transition: `background-color ${motion.fast}ms, color ${motion.fast}ms`,
                  '& svg': {
                    color: active ? tokensOf(theme).accent.main : tokensOf(theme).textMuted,
                    flex: 'none',
                  },
                  '&:hover': { bgcolor: tokensOf(theme).surfaceMuted, color: tokensOf(theme).text },
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

export function AppLayout() {
  const navigate = useNavigate();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const me = useCurrentUser();
  const logout = useLogout();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showCoverage = canSeeCoverage(me.data);
  const navItems = [
    ...NAV_ITEMS,
    ...(showCoverage ? [COVERAGE_ITEM] : []),
    ...(me.data?.role === 'SUPER_ADMIN' ? [ADMIN_ITEM] : []),
  ];

  function handleLogout(): void {
    logout.mutate(undefined, { onSettled: () => navigate('/connexion', { replace: true }) });
  }

  const user = me.data && (
    <Person
      name={me.data.displayName}
      id={me.data.id}
      size={32}
      secondary={ROLE_LABELS[me.data.role]}
    />
  );

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
              px: 1.5,
              py: 2,
              bgcolor: 'background.paper',
              borderRight: 1,
              borderColor: 'divider',
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
              <Box sx={{ px: 0.5 }}>{user}</Box>
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
                borderBottom: 1,
                borderColor: 'divider',
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
                {user && (
                  <Box sx={{ mt: 'auto', pt: 2, borderTop: 1, borderColor: 'divider' }}>{user}</Box>
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
