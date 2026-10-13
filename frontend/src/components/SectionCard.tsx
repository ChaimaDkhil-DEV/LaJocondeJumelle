import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { LucideIcon } from 'lucide-react';
import { useId, type ElementType, type ReactNode } from 'react';
import { icon as iconSize } from '../design/tokens';

interface SectionCardProps {
  /** Titre de section (h2) ; absent : simple carte. */
  title?: ReactNode;
  icon?: LucideIcon;
  description?: ReactNode;
  /** Actions secondaires de la section, à droite du titre. */
  actions?: ReactNode;
  children: ReactNode;
  /** Élément racine (section, form…). */
  component?: ElementType;
  /** Supprime le rembourrage intérieur (listes bord à bord). */
  flush?: boolean;
  titleId?: string;
  /** Espacement vertical entre les enfants (unités MUI) ; absent : enfants posés tels quels. */
  contentGap?: number;
  noValidate?: boolean;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}

/** Carte de contenu : bordure fine, rayon 12 px, titre de section facultatif. */
export function SectionCard({
  title,
  icon: Icon,
  description,
  actions,
  children,
  component = 'section',
  flush = false,
  titleId,
  contentGap,
  ...rest
}: SectionCardProps) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  return (
    <Paper
      variant="outlined"
      component={component}
      aria-labelledby={title ? headingId : undefined}
      sx={{ p: flush ? 0 : { xs: 2, sm: 3 }, minWidth: 0 }}
      {...rest}
    >
      {title && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            mb: 2,
            ...(flush && { px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 2.5 } }),
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography id={headingId} component="h2" variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {Icon && (
                <Box component="span" sx={{ display: 'flex', color: 'text.secondary' }}>
                  <Icon size={iconSize.md} aria-hidden="true" />
                </Box>
              )}
              {title}
            </Typography>
            {description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {description}
              </Typography>
            )}
          </Box>
          {actions && <Box sx={{ display: 'flex', gap: 1 }}>{actions}</Box>}
        </Box>
      )}
      {contentGap === undefined ? children : <Box sx={{ display: 'grid', gap: contentGap }}>{children}</Box>}
    </Paper>
  );
}
