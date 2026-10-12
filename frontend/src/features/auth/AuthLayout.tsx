import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** Mise en page des écrans hors application (connexion, changement de mot de passe). */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      component="main"
      sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}
    >
      <Paper sx={{ width: '100%', maxWidth: 420, p: { xs: 2, sm: 4 } }}>
        <Typography component="p" color="text.secondary" sx={{ mb: 1 }}>
          Demandes de travail
        </Typography>
        <Typography component="h1" variant="h5" sx={{ mb: 3 }}>
          {title}
        </Typography>
        {children}
      </Paper>
    </Box>
  );
}
