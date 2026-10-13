import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useCurrentUser, useLogout } from '../features/auth/useCurrentUser';
import { NotificationCenter } from '../features/notifications/NotificationCenter';
import { SocketProvider } from '../features/notifications/SocketProvider';

export interface NavItem {
  to: string;
  label: string;
}

/** Entrées de navigation communes. */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Mes demandes' },
  { to: '/demandes/nouvelle', label: 'Nouvelle demande' },
];

/** Entrée réservée au super administrateur (le serveur refuse aussi /api/admin aux autres rôles). */
const ADMIN_ITEM: NavItem = { to: '/admin', label: 'Administration' };

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
        px: 2,
        py: 1,
        '&:focus': { top: 8 },
      }}
    >
      Aller au contenu
    </Link>
  );
}

export function AppLayout() {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const logout = useLogout();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navItems = me.data?.role === 'SUPER_ADMIN' ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  function handleLogout(): void {
    logout.mutate(undefined, { onSettled: () => navigate('/connexion', { replace: true }) });
  }

  const navList = (
    <List component="nav" aria-label="Navigation principale">
      {navItems.map((item) => (
        <ListItemButton
          key={item.to}
          component={NavLink}
          to={item.to}
          end={item.to === '/'}
          onClick={() => setDrawerOpen(false)}
        >
          <ListItemText primary={item.label} />
        </ListItemButton>
      ))}
    </List>
  );

  return (
    <SocketProvider>
      <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', overflowX: 'hidden' }}>
        <SkipLink />
        <AppBar position="sticky" component="header">
          <Toolbar sx={{ gap: 1 }}>
            <IconButton
              color="inherit"
              edge="start"
              aria-label="Ouvrir le menu"
              onClick={() => setDrawerOpen(true)}
              sx={{ display: { sm: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography component="p" variant="h6" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
              Demandes de travail
            </Typography>
            <Box
              component="nav"
              aria-label="Navigation principale"
              sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1 }}
            >
              {navItems.map((item) => (
                <Button key={item.to} color="inherit" component={NavLink} to={item.to} end={item.to === '/'}>
                  {item.label}
                </Button>
              ))}
            </Box>
            {me.data && (
              <Typography noWrap sx={{ display: { xs: 'none', md: 'block' }, maxWidth: 220 }}>
                {me.data.displayName}
              </Typography>
            )}
            <NotificationCenter />
            <Button
              color="inherit"
              onClick={handleLogout}
              startIcon={<LogoutIcon aria-hidden="true" />}
            >
              Se déconnecter
            </Button>
          </Toolbar>
        </AppBar>
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          sx={{ display: { sm: 'none' } }}
        >
          <Box sx={{ width: 260 }}>{navList}</Box>
        </Drawer>
        <Box
          component="main"
          id="contenu"
          tabIndex={-1}
          sx={{ maxWidth: 960, mx: 'auto', px: 2, py: 3, '&:focus': { outline: 'none' } }}
        >
          <Outlet />
        </Box>
      </Box>
    </SocketProvider>
  );
}
