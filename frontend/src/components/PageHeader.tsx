import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { ArrowLeft, ChevronRight, House } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { font, fontSize, icon, tokensOf } from '../design/tokens';

export interface Crumb {
  label: string;
  /** Absent : page courante. */
  to?: string;
}

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
  /**
   * Fil d'Ariane à droite du titre. Par défaut : « Accueil › titre » quand le titre est un texte ;
   * `false` le masque.
   */
  breadcrumb?: Crumb[] | false;
  /** Contenu sous le titre (badges…). */
  children?: ReactNode;
  titleId?: string;
  /**
   * En-tête discret (formulaire centré) : retour et fil d'Ariane sur une seule petite ligne au-dessus
   * du titre, sans action à droite.
   */
  compact?: boolean;
}

/** Fil d'Ariane (WAI-ARIA « breadcrumb ») : liens, puis la page courante (`aria-current`). */
function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <Box component="nav" aria-label="Fil d’Ariane" sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0 }}>
      <Box
        component="ol"
        sx={(theme) => ({
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 0.75,
          fontSize: fontSize.sm,
          color: tokensOf(theme).textSecondary,
        })}
      >
        {items.map((item, index) => (
          <Box component="li" key={`${index}-${item.label}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            {index > 0 && <ChevronRight size={icon.sm - 2} aria-hidden="true" />}
            {item.to ? (
              <Box
                component={RouterLink}
                to={item.to}
                sx={(theme) => ({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color: tokensOf(theme).textSecondary,
                  textDecoration: 'none',
                  '&:hover': { color: tokensOf(theme).accent.main, textDecoration: 'underline' },
                })}
              >
                {index === 0 && <House size={icon.sm - 2} aria-hidden="true" />}
                {item.label}
              </Box>
            ) : (
              <Box
                component="span"
                aria-current="page"
                sx={(theme) => ({ color: tokensOf(theme).text, fontWeight: font.medium, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}
              >
                {item.label}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** En-tête de page : grand titre (h1), sous-titre discret, fil d'Ariane et action principale à droite. */
export function PageHeader({ title, description, eyebrow, actions, back, breadcrumb, children, titleId, compact = false }: PageHeaderProps) {
  const crumbs = breadcrumb ?? (typeof title === 'string' ? [{ label: 'Accueil', to: '/' }, { label: title }] : false);
  if (compact) {
    return (
      <Box component="header" sx={{ mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1, minHeight: 32 }}>
          {back && (
            <Button
              component={RouterLink}
              to={back.to}
              size="small"
              color="inherit"
              startIcon={<ArrowLeft size={icon.sm} aria-hidden="true" />}
              sx={(theme) => ({ ml: -1.25, color: tokensOf(theme).textSecondary, fontWeight: font.regular })}
            >
              {back.label}
            </Button>
          )}
          {crumbs && <Breadcrumb items={crumbs} />}
        </Box>
        <Typography id={titleId} component="h1" variant="h1" sx={{ fontSize: { xs: fontSize.xl, sm: fontSize.xxl }, overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        )}
      </Box>
    );
  }
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
          <Typography id={titleId} component="h1" variant="h1" sx={{ overflowWrap: 'anywhere' }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 640 }}>
              {description}
            </Typography>
          )}
        </Box>
        {(crumbs || actions) && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', sm: 'flex-end' }, gap: 1.5, minWidth: 0 }}>
            {crumbs && <Breadcrumb items={crumbs} />}
            {actions && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>{actions}</Box>}
          </Box>
        )}
      </Box>
      {children && <Box sx={{ mt: 1.5 }}>{children}</Box>}
    </Box>
  );
}
