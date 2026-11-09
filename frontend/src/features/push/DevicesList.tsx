import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { ApiError } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { formatDateTime } from '../../components/format';
import { icon } from '../../design/tokens';
import { t } from '../../i18n';
import { usePushDevices, useRemovePushDevice, type PushDevice } from './api';

/**
 * Bloc « Mes appareils » de la section « Notifications » (spec 014, US5, FR-003) : appareils abonnés du
 * compte, appareil courant signalé, retrait avec confirmation. Utilisable même si le push est désactivé.
 */
export function DevicesList() {
  const devices = usePushDevices();
  const remove = useRemovePushDevice();
  const [pending, setPending] = useState<PushDevice | null>(null);
  const headingId = useId();
  const list = Array.isArray(devices.data) ? devices.data : [];

  const close = () => {
    setPending(null);
    remove.reset();
  };

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Typography id={headingId} component="h3" variant="subtitle1">
        {t('Mes appareils')}
      </Typography>
      {devices.isSuccess && list.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('Aucun appareil abonné.')}
        </Typography>
      )}
      {list.length > 0 && (
        <Box component="ul" aria-labelledby={headingId} sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
          {list.map((device) => (
            <Box
              component="li"
              key={device.id}
              sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, minWidth: 0 }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ overflowWrap: 'anywhere' }}>{device.deviceLabel}</Typography>
                  {device.current && <Chip size="small" label={t('Cet appareil')} />}
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {t('Activé le {date}', { date: formatDateTime(device.createdAt) })}
                  {' · '}
                  {t('Dernière utilisation le {date}', { date: formatDateTime(device.lastUsedAt) })}
                </Typography>
              </Box>
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={() => setPending(device)}
                aria-label={t('Retirer {device}', { device: device.deviceLabel })}
                startIcon={<Trash2 size={icon.sm} aria-hidden="true" />}
                sx={{ minHeight: 44 }}
              >
                {t('Retirer')}
              </Button>
            </Box>
          ))}
        </Box>
      )}
      <ConfirmDialog
        open={pending !== null}
        title={t('Retirer cet appareil ?')}
        confirmLabel={t('Retirer')}
        pending={remove.isPending}
        error={remove.error ? (remove.error instanceof ApiError ? remove.error.message : t('Retrait impossible. Réessayez.')) : null}
        onConfirm={() => pending && remove.mutate(pending.id, { onSuccess: close })}
        onClose={close}
      >
        {pending && t('{device} ne recevra plus vos notifications push.', { device: pending.deviceLabel })}
      </ConfirmDialog>
    </Box>
  );
}
