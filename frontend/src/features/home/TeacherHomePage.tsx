import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import type { CSSObject, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { ChevronRight, Mic, QrCode, Siren, type LucideIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { visuallyHidden } from '../../components/a11y';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { cardShadow, font, fontSize, homeActions, layout, motion, tokensOf } from '../../design/tokens';
import { isPlural, t } from '../../i18n';
import { QrScannerDialog } from '../attendance/QrScannerDialog';
import { OutboxPanel } from '../outbox/OutboxPanel';
import { useTracking } from '../requests/api';
import { TRACKING_VIEWS, type TrackingView } from './tracking';

/** Survol, appui et focus clavier communs aux grands boutons de l'accueil. */
function interactive(theme: Theme, hoverBorder: string): CSSObject {
  return {
    transition: `border-color ${motion.fast}ms, box-shadow ${motion.fast}ms, transform ${motion.fast}ms`,
    '&:hover': { borderColor: hoverBorder, boxShadow: cardShadow },
    '&:active': { transform: 'scale(0.99)' },
    '&.Mui-focusVisible, &:focus-visible': { outline: `2px solid ${tokensOf(theme).focus}`, outlineOffset: 2 },
    '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:active': { transform: 'none' } },
  };
}

/** Anneau de focus clavier des trois grands boutons : sombre, ou blanc en mode sombre. */
function focusRing(theme: Theme): CSSObject {
  const color = theme.palette.mode === 'dark' ? homeActions.focusRing.dark : homeActions.focusRing.light;
  return { '&.Mui-focusVisible, &:focus-visible': { outline: `3px solid ${color}`, outlineOffset: '3px' } };
}

/** Action principale : lecteur de QR code existant (caméra ouverte dès le clic), puis page de la classe. */
function ScanButton() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const labelId = useId();
  const hintId = useId();
  return (
    <>
      <ButtonBase
        focusRipple
        aria-labelledby={labelId}
        aria-describedby={hintId}
        aria-haspopup="dialog"
        onClick={() => setScanning(true)}
        sx={(theme) => ({
          width: '100%',
          minHeight: { xs: 128, sm: 152 },
          px: 3,
          py: 2.5,
          borderRadius: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          bgcolor: homeActions.scan.main,
          color: homeActions.scan.text,
          boxShadow: homeActions.scan.shadow,
          transition: 'transform .1s, box-shadow .1s, background .15s',
          '&:hover': { bgcolor: homeActions.scan.hover },
          '&:active': { transform: 'translateY(1px)' },
          ...focusRing(theme),
        })}
      >
        <QrCode size={44} strokeWidth={1.75} aria-hidden="true" />
        <Typography id={labelId} component="span" sx={{ fontSize: { xs: fontSize.lg, sm: fontSize.xl }, fontWeight: font.semibold, lineHeight: 1.2 }}>
          {t('Scanner un QR code')}
        </Typography>
        <Typography id={hintId} component="span" sx={{ fontSize: fontSize.sm, color: homeActions.scan.hint, textAlign: 'center' }}>
          {t('La caméra s’ouvre : visez le QR code affiché dans la classe.')}
        </Typography>
      </ButtonBase>
      {scanning && (
        <QrScannerDialog
          onClose={() => setScanning(false)}
          onToken={(token) => {
            setScanning(false);
            navigate(`/gardes/presence?c=${encodeURIComponent(token)}`);
          }}
        />
      )}
    </>
  );
}

/** Demande urgente (rouge) ou normale (jaune) : le formulaire vocal, priorité préremplie. */
function NewRequestButton({ priority, label, icon: Icon }: { priority: 'URGENT' | 'NORMAL'; label: string; icon: LucideIcon }) {
  const labelId = useId();
  const hintId = useId();
  return (
    <ButtonBase
      component={RouterLink}
      to={`/demandes/nouvelle?priorite=${priority}`}
      aria-labelledby={labelId}
      aria-describedby={hintId}
      focusRipple
      sx={(theme) => {
        const tone = priority === 'URGENT' ? homeActions.urgent : homeActions.normal;
        return {
          minHeight: 104,
          p: 2,
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
          textAlign: 'center',
          bgcolor: tone.main,
          color: tone.text,
          boxShadow: `0 4px 0 ${tone.relief}`,
          transition: 'transform .1s, box-shadow .1s, background .15s',
          '& .request-hint': { color: tone.hint },
          '&:hover': { bgcolor: tone.hover },
          '&:active': { transform: 'translateY(3px)', boxShadow: '0 1px 0 rgba(0,0,0,.25)' },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:active': { transform: 'none' } },
          ...focusRing(theme),
        };
      }}
    >
      <Icon size={30} aria-hidden="true" />
      <Typography id={labelId} component="span" sx={{ fontSize: { xs: fontSize.md, sm: fontSize.lg }, fontWeight: font.semibold, lineHeight: 1.25 }}>
        {label}
      </Typography>
      <Typography id={hintId} component="span" className="request-hint" sx={{ fontSize: fontSize.xs, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <Mic size={14} aria-hidden="true" />
        {t('Message vocal')}
      </Typography>
    </ButtonBase>
  );
}

/**
 * Bouton de suivi : toute la surface est le lien ; icône, titre, descriptif, compteur et chevron. Nom
 * accessible : titre et nombre (« En attente 3 demandes ») ; le descriptif en est la description.
 */
function TrackingButton({ view, count }: { view: TrackingView; count: number | 'loading' | 'error' }) {
  const Icon = view.icon;
  const titleId = useId();
  const countId = useId();
  const descriptionId = useId();
  const spoken =
    typeof count === 'number'
      ? t(isPlural(count) ? '{count} demandes' : '{count} demande', { count })
      : count === 'loading'
        ? t('nombre en cours de chargement')
        : t('nombre indisponible');
  return (
    <ButtonBase
      component={RouterLink}
      to={`/demandes/suivi/${view.slug}`}
      aria-labelledby={`${titleId} ${countId}`}
      aria-describedby={descriptionId}
      focusRipple
      sx={(theme) => {
        const tone = view.colors(tokensOf(theme));
        return {
          width: '100%',
          minHeight: 88,
          px: { xs: 1.5, sm: 2.5 },
          py: 1.5,
          borderRadius: '16px',
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
          alignItems: 'center',
          columnGap: { xs: 1.5, sm: 2 },
          justifyContent: 'stretch',
          textAlign: 'left',
          bgcolor: tone.bg,
          color: 'text.primary',
          border: `1px solid ${tokensOf(theme).border}`,
          ...interactive(theme, tone.border),
        };
      }}
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={(theme) => ({
          width: 48,
          height: 48,
          borderRadius: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
          color: view.colors(tokensOf(theme)).accent,
        })}
      >
        <Icon size={24} />
      </Box>
      <Box component="span" sx={{ minWidth: 0, display: 'grid', gap: 0.25 }}>
        <Typography id={titleId} component="span" sx={{ fontSize: fontSize.md, fontWeight: font.semibold, lineHeight: 1.3 }}>
          {view.title}
        </Typography>
        <Typography id={descriptionId} component="span" variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {view.description}
        </Typography>
      </Box>
      <Box
        component="span"
        sx={(theme) => ({
          minWidth: 40,
          textAlign: 'right',
          fontSize: fontSize.xxl,
          fontWeight: font.semibold,
          fontVariantNumeric: 'tabular-nums',
          color: view.colors(tokensOf(theme)).accent,
        })}
      >
        <span aria-hidden="true">{typeof count === 'number' ? count : '–'}</span>
        <Box component="span" id={countId} sx={visuallyHidden}>
          {spoken}
        </Box>
      </Box>
      <Box component="span" aria-hidden="true" sx={{ display: 'flex', color: 'text.secondary' }}>
        <ChevronRight size={22} />
      </Box>
    </ButtonBase>
  );
}

/**
 * Accueil de l'enseignant (016) : scanner le QR code de la classe (action principale), demande
 * urgente ou normale (formulaire vocal existant, priorité préremplie), puis « Suivi de mes demandes ».
 * Les compteurs ne portent que sur les demandes envoyées par l'enseignant connecté (vérifié par l'API).
 */
export function TeacherHomePage() {
  const tracking = useTracking();
  const trackingId = useId();
  const countOf = (view: TrackingView) => (tracking.isPending ? 'loading' : tracking.error ? 'error' : tracking.data[view.group]);

  return (
    <Box sx={{ maxWidth: layout.readable, mx: 'auto' }}>
      <PageHeader title={t('Accueil')} description={t('Vos actions rapides et le suivi de vos demandes.')} breadcrumb={false} />

      {/* Demandes restées hors ligne : visibles dès l'accueil, comme sur « Mes demandes ». */}
      <OutboxPanel />

      <Box sx={{ display: 'grid', gap: 2 }}>
        <ScanButton />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: { xs: '10px', sm: 2 } }}>
          <NewRequestButton priority="URGENT" label={t('Demande urgente')} icon={Siren} />
          <NewRequestButton priority="NORMAL" label={t('Demande normale')} icon={Mic} />
        </Box>
      </Box>

      <Box component="section" aria-labelledby={trackingId} sx={{ mt: 4 }}>
        <Typography id={trackingId} component="h2" variant="h5" sx={{ mb: 1.5 }}>
          {t('Suivi de mes demandes')}
        </Typography>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
          {TRACKING_VIEWS.map((view) => (
            <li key={view.group}>
              <TrackingButton view={view} count={countOf(view)} />
            </li>
          ))}
        </Box>
        {tracking.error && (
          <ErrorState
            message={t('Impossible de charger le nombre de vos demandes.')}
            actionLabel={t('Réessayer')}
            onAction={() => void tracking.refetch()}
          />
        )}
      </Box>
    </Box>
  );
}
