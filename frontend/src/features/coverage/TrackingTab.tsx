import Box from '@mui/material/Box';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useSearchParams } from 'react-router';
import { t } from '../../i18n';
import { ManagedCoverageTab } from './ManagerViews';
import { TRACKING_SCOPE, trackingFilterOf, type TrackingFilter } from './surveillanceTabs';

const LABELS: Record<TrackingFilter, string> = {
  'en-attente': t('En attente'),
  'prise-en-charge': t('Prise en charge'),
  terminee: t('Terminée'),
};

/**
 * « Suivi des interventions » (012, research R3) : un filtre sur les listes des anciens onglets « En attente »,
 * « En cours » et « Terminées ». Les statuts ne changent pas : chaque ligne garde son statut précis et ses
 * alertes. Le filtre est gardé dans l'adresse (`?filtre=`).
 */
export function TrackingTab() {
  const [params, setParams] = useSearchParams();
  const filter = trackingFilterOf(params.get('filtre'));

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        color="primary"
        value={filter}
        aria-label={t('Filtrer les interventions')}
        onChange={(_e, next: TrackingFilter | null) => {
          if (!next) return;
          const updated = new URLSearchParams(params);
          updated.set('filtre', next);
          setParams(updated, { replace: true });
        }}
        sx={{ flexWrap: 'wrap', justifySelf: 'start' }}
      >
        {(Object.keys(LABELS) as TrackingFilter[]).map((key) => (
          <ToggleButton key={key} value={key}>
            {LABELS[key]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <ManagedCoverageTab key={filter} scope={TRACKING_SCOPE[filter]} />
    </Box>
  );
}
