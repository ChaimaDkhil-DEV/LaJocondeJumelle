import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

interface SectionHeaderProps {
  id?: string;
  title: string;
  description?: ReactNode;
  /** Action principale de la section, à droite. */
  action?: ReactNode;
}

/** En-tête d'une section de page (h2) : même hiérarchie que PageHeader, un cran en dessous. */
export function SectionHeader({ id, title, description, action }: SectionHeaderProps) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 2 }}>
      <Box sx={{ minWidth: 0, flex: '1 1 240px' }}>
        <Typography id={id} component="h2" variant="h5">
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        )}
      </Box>
      {action}
    </Box>
  );
}
