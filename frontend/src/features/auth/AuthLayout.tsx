import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ClipboardList } from 'lucide-react';
import type { ReactNode } from 'react';
import { icon, tokensOf } from '../../design/tokens';

interface AuthLayoutProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/** Mise en page des écrans hors application (connexion, changement de mot de passe). */
export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        px: 2,
        py: 4,
        bgcolor: 'background.default',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box
          aria-hidden="true"
          sx={(theme) => ({
            width: 32,
            height: 32,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: tokensOf(theme).accent.main,
            color: tokensOf(theme).accent.contrastText,
          })}
        >
          <ClipboardList size={icon.md} />
        </Box>
        <Typography component="p" variant="subtitle1">
          Demandes de travail
        </Typography>
      </Box>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 400, p: { xs: 3, sm: 4 } }}>
        <Typography component="h1" variant="h5">
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        )}
        <Box sx={{ mt: 3 }}>{children}</Box>
      </Paper>
    </Box>
  );
}
