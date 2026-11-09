import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { useId, useState } from 'react';
import { DEFAULT_CLIENT_SETTINGS, useClientSettings } from '../../api/settings';
import { SectionCard } from '../../components/SectionCard';
import { icon } from '../../design/tokens';
import { t } from '../../i18n';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationPreferencesPatch,
  type PushCategoryName,
} from '../notifications/api';
import { DevicesList } from './DevicesList';
import type { PushSupportState } from './pushSupport';
import { pushWindowText } from './pushWindowText';
import { usePushDevice } from './usePushDevice';

/** Message de l'état du push sur l'appareil courant (contracts/ui.md). */
function stateMessage(state: PushSupportState): string {
  switch (state) {
    case 'disabled':
      return t('Les notifications push ne sont pas activées par l’établissement.');
    case 'unsupported':
      return t('Cet appareil ou ce navigateur ne permet pas les notifications push. Les notifications restent visibles dans l’application.');
    case 'ios-install':
      return t('Sur iPhone et iPad (iOS 16.4 ou plus récent), ajoutez d’abord l’application à l’écran d’accueil :');
    case 'denied':
      return t('Vous avez refusé les notifications pour ce site. Réactivez-les dans les réglages du navigateur ou du téléphone.');
    case 'reactivate':
      return t('Les notifications de cet appareil doivent être réactivées.');
    case 'inactive':
      return t('Les notifications push sont désactivées sur cet appareil.');
    case 'active':
      return t('Les notifications push sont actives sur cet appareil.');
  }
}

function DeviceBlock() {
  const device = usePushDevice();
  const headingId = useId();
  const stepsId = useId();
  const { state, busy } = device;
  const progress = busy ? <CircularProgress size={icon.sm} color="inherit" aria-hidden="true" /> : undefined;

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Typography id={headingId} component="h3" variant="subtitle1">
        {t('Cet appareil')}
      </Typography>
      <Box role="status" aria-labelledby={headingId} aria-live="polite" aria-busy={state === null || busy}>
        {state !== null && (
          <>
            <Typography>{stateMessage(state)}</Typography>
            {state === 'ios-install' && (
              <Box component="ol" aria-label={t('Installer l’application sur l’écran d’accueil')} sx={{ m: 0, mt: 1, pl: 3 }}>
                <li>{t('Touchez « Partager ».')}</li>
                <li>{t('Choisissez « Sur l’écran d’accueil ».')}</li>
                <li>{t('Ouvrez l’application depuis l’écran d’accueil, puis revenez ici.')}</li>
              </Box>
            )}
          </>
        )}
      </Box>
      {device.error && <Alert severity="error">{device.error}</Alert>}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {state === 'inactive' && (
          <Button
            variant="contained"
            onClick={() => void device.activate()}
            disabled={busy}
            startIcon={progress ?? <BellRing size={icon.sm} aria-hidden="true" />}
            sx={{ minHeight: 44 }}
          >
            {t('Activer les notifications sur cet appareil')}
          </Button>
        )}
        {state === 'reactivate' && (
          <Button
            variant="contained"
            onClick={() => void device.activate()}
            disabled={busy}
            startIcon={progress ?? <BellRing size={icon.sm} aria-hidden="true" />}
            sx={{ minHeight: 44 }}
          >
            {t('Réactiver')}
          </Button>
        )}
        {state === 'active' && (
          <Button
            variant="outlined"
            onClick={() => void device.deactivate()}
            disabled={busy}
            startIcon={progress ?? <BellOff size={icon.sm} aria-hidden="true" />}
            sx={{ minHeight: 44 }}
          >
            {t('Désactiver sur cet appareil')}
          </Button>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" id={stepsId}>
        {t('Sur un appareil partagé, déconnectez-vous en partant : sinon vos notifications continuent d’y arriver.')}
      </Typography>
    </Box>
  );
}

/** Interrupteur libellé, avec sa description reliée (aria-describedby). */
function PreferenceSwitch(props: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const descriptionId = useId();
  return (
    <Box>
      <FormControlLabel
        control={
          <Switch
            checked={props.checked}
            disabled={props.disabled}
            onChange={(event) => props.onChange(event.target.checked)}
            slotProps={{ input: { 'aria-describedby': descriptionId } }}
          />
        }
        label={props.label}
        sx={{ minHeight: 44, mr: 0 }}
      />
      <Typography id={descriptionId} variant="body2" color="text.secondary" sx={{ pl: { xs: 0, sm: 6 }, mt: -0.5 }}>
        {props.description}
      </Typography>
    </Box>
  );
}

const CATEGORY_TEXTS: Array<{ key: PushCategoryName; label: string; description: string }> = [
  { key: 'urgent', label: t('Urgent'), description: t('Demandes de travail urgentes.') },
  { key: 'coverage', label: t('Couverture'), description: t('Affectations, classes vides, retards et absences signalés, relèves.') },
  { key: 'unfilled', label: t('Garde non pourvue'), description: t('Gardes restées sans surveillant et alertes non traitées.') },
  { key: 'attendance', label: t('Pointage'), description: t('Arrivée de l’enseignant sur votre garde et anomalies de pointage.') },
];

/** Catégories push et son des urgences, sur le compte (FR-009) : enregistrés dès le changement. */
function PreferencesBlock() {
  const preferences = useNotificationPreferences();
  const settings = useClientSettings();
  const update = useUpdateNotificationPreferences();
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null);
  const data = preferences.data;
  const disabled = data === undefined;

  const save = (patch: NotificationPreferencesPatch) => {
    setFeedback(null);
    update.mutate(patch, { onSuccess: () => setFeedback('saved'), onError: () => setFeedback('error') });
  };

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Box>
        <Typography component="h3" variant="subtitle1">
          {t('Catégories')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('Ces choix s’appliquent à tous vos appareils abonnés.')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {pushWindowText(
            Array.isArray(settings.pushWindowDays) ? settings.pushWindowDays : DEFAULT_CLIENT_SETTINGS.pushWindowDays,
            settings.pushWindowStart ?? DEFAULT_CLIENT_SETTINGS.pushWindowStart,
            settings.pushWindowEnd ?? DEFAULT_CLIENT_SETTINGS.pushWindowEnd,
          )}
        </Typography>
      </Box>
      {CATEGORY_TEXTS.map((category) => (
        <PreferenceSwitch
          key={category.key}
          label={category.label}
          description={category.description}
          checked={data?.categories?.[category.key] ?? true}
          disabled={disabled}
          onChange={(checked) => save({ categories: { [category.key]: checked } })}
        />
      ))}
      <Typography component="h3" variant="subtitle1">
        {t('Son des urgences')}
      </Typography>
      <PreferenceSwitch
        label={t('Signal sonore pour les urgences')}
        description={t('Deux notes brèves quand une notification urgente arrive dans l’application.')}
        checked={data?.urgentSound ?? true}
        disabled={disabled}
        onChange={(checked) => save({ urgentSound: checked })}
      />
      <Typography role="status" aria-live="polite" variant="body2" color="text.secondary">
        {feedback === 'saved' ? t('Préférence enregistrée.') : ''}
      </Typography>
      {feedback === 'error' && <Alert severity="error">{t('La préférence n’a pas pu être enregistrée. Réessayez.')}</Alert>}
    </Box>
  );
}

/** Section « Notifications » de « Mon profil » (spec 014, contracts/ui.md). */
export function NotificationsSection() {
  return (
    <SectionCard title={t('Notifications')} icon={Bell}>
      <Box sx={{ display: 'grid', gap: 3 }}>
        <DeviceBlock />
        <PreferencesBlock />
        <DevicesList />
      </Box>
    </SectionCard>
  );
}
