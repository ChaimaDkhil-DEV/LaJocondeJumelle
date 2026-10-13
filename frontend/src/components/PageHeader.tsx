import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { icon } from '../design/tokens';

interface PageHeaderProps {
  title: ReactNode;
  /** Courte phrase sous le titre. */
  description?: ReactNode;
  /** Ligne discrète au-dessus du titre (référence, catégorie…). */
  eyebrow?: ReactNode;
  /** Action principale (un seul bouton « contained » par écran), alignée à droite. */
  actions?: ReactNode;
  /** Lien de retour affiché au-dessus. */
  back?: { to: string; label: string };
  /** Contenu sous le titre (badges…). */
  children?: ReactNode;
  titleId?: string;
}

/** En-tête de page : titre (h1), description et action principale à droite. */
export function PageHeader({ title, description, eyebrow, actions, back, children, titleId }: PageHeaderProps) {
  return (
    <Box component="header" sx={{ mb: 3 }}>
      {back && (
        <Button
          component={RouterLink}
          to={back.to}
          size="small"
          startIcon={<ArrowLeft size={icon.sm} aria-hidden="true" />}
          sx={{ mb: 1.5, ml: -1.25 }}
        >
          {back.label}
        </Button>
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ minWidth: 0, flex: '1 1 260px' }}>
          {eyebrow && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, overflowWrap: 'anywhere' }}>
              {eyebrow}
            </Typography>
          )}
          <Typography id={titleId} component="h1" variant="h4" sx={{ overflowWrap: 'anywhere' }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 640 }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>{actions}</Box>}
      </Box>
      {children && <Box sx={{ mt: 1.5 }}>{children}</Box>}
    </Box>
  );
}
