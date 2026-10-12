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

export interface NavItem {
  to: string;
  label: string;
}

/** Entrées de navigation ; complétées par les user stories suivantes. */
export const NAV_ITEMS: NavItem[] = [{ to: '/', label: 'Accueil' }];

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

  function handleLogout(): void {
    logout.mutate(undefined, { onSettled: () => navigate('/connexion', { replace: true }) });
  }

  const navList = (
    <List component="nav" aria-label="Navigation principale">
      {NAV_ITEMS.map((item) => (
        <ListItemButton
          key={item.to}
          component={NavLink}
          to={item.to}
          end
          onClick={() => setDrawerOpen(false)}
        >
          <ListItemText primary={item.label} />
        </ListItemButton>
      ))}
    </List>
  );

  return (
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
          <Box component="nav" aria-label="Navigation principale" sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1 }}>
            {NAV_ITEMS.map((item) => (
              <Button key={item.to} color="inherit" component={NavLink} to={item.to} end>
                {item.label}
              </Button>
            ))}
          </Box>
          {me.data && (
            <Typography noWrap sx={{ display: { xs: 'none', md: 'block' }, maxWidth: 220 }}>
              {me.data.displayName}
            </Typography>
          )}
          <Button color="inherit" onClick={handleLogout} startIcon={<LogoutIcon aria-hidden="true" />}>
            Se déconnecter
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} sx={{ display: { sm: 'none' } }}>
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
  );
}
