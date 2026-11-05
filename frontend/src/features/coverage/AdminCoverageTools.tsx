import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Pencil, UserMinus } from 'lucide-react';
import { useId, useState } from 'react';
import { ApiError } from '../../api/client';
import { useToast } from '../../components/Toast';
import { Person } from '../../components/UserAvatar';
import { icon } from '../../design/tokens';
import { useCoverageAction, useCoverageTeachers } from './api';
import { formatTime } from './labels';
import type { CoverageDetail } from './types';
import { t } from '../../i18n';

const NO_TEACHER = 'none';

/**
 * Renforts présents dans la classe ; l'admin libère chacun d'eux (FR-015i). Rendu vide sans renfort,
 * mais à garder monté : la mutation (et son message de confirmation) appartient à ce composant.
 */
export function SupportsList({ detail }: { detail: CoverageDetail }) {
  const toast = useToast();
  const action = useCoverageAction(detail.id);
  const canRelease = detail.allowedActions.includes('RELEASE_SUPPORT');
  if (detail.supports.length === 0) return null;
  return (
    <Box sx={{ display: 'grid', gap: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        {t('Renfort')}
      </Typography>
      <Box
        component="ul"
        aria-label={t('Renforts')}
        sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}
      >
        {detail.supports.map((s) => (
          <Box
            component="li"
            key={s.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <Person
              name={s.user.displayName}
              id={s.user.id}
              size={28}
              secondary={t('En renfort depuis {time}', { time: formatTime(s.joinedAt) })}
            />
            {canRelease && (
              <Button
                size="small"
                startIcon={<UserMinus size={icon.sm} aria-hidden="true" />}
                aria-label={t('Libérer {name}', { name: s.user.displayName })}
                disabled={action.isPending}
                onClick={() =>
                  action.mutate(
                    { action: 'RELEASE_SUPPORT', supportId: s.id, version: detail.version },
                    {
                      onSuccess: () =>
                        toast.success(t('{name} est libéré(e) et reprend sa tournée.', { name: s.user.displayName })),
                      onError: (err) =>
                        toast.error(
                          err instanceof ApiError ? err.message : t('Libération impossible.'),
                        ),
                    },
                  )
                }
              >
                {t('Libérer')}
              </Button>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Enseignant concerné, et sa correction par l'admin (FR-015b, FR-015c), tracée côté serveur. */
export function TeacherField({ detail }: { detail: CoverageDetail }) {
  const [open, setOpen] = useState(false);
  const canSet = detail.allowedActions.includes('SET_TEACHER');
  return (
    <Box sx={{ display: 'grid', gap: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        {t('Enseignant')}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2">
          {detail.teacher?.displayName ?? detail.absentTeacher ?? t('Enseignant non précisé')}
        </Typography>
        {detail.substituteTeacher && (
          <Typography variant="body2" color="text.secondary">
            {t('Remplaçant autorisé : {name}', { name: detail.substituteTeacher.displayName })}
          </Typography>
        )}
        {canSet && (
          <Button
            size="small"
            startIcon={<Pencil size={icon.sm} aria-hidden="true" />}
            onClick={() => setOpen(true)}
          >
            {t('Corriger l’enseignant')}
          </Button>
        )}
      </Box>
      {open && <TeacherDialog detail={detail} onClose={() => setOpen(false)} />}
    </Box>
  );
}

function TeacherDialog({ detail, onClose }: { detail: CoverageDetail; onClose: () => void }) {
  const titleId = useId();
  const toast = useToast();
  const teachers = useCoverageTeachers();
  const action = useCoverageAction(detail.id);
  const [teacherId, setTeacherId] = useState(detail.teacher?.id ?? NO_TEACHER);
  const [error, setError] = useState<string | null>(null);

  function save(): void {
    setError(null);
    action.mutate(
      {
        action: 'SET_TEACHER',
        teacherId: teacherId === NO_TEACHER ? null : teacherId,
        version: detail.version,
      },
      {
        onSuccess: () => {
          toast.success(t('Enseignant enregistré.'));
          onClose();
        },
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : t('Enregistrement impossible.')),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>{t('Corriger l’enseignant')}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        <TextField
          select
          id="correction-enseignant"
          label={t('Enseignant')}
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          error={Boolean(error)}
          helperText={error ?? t('Membre du groupe Enseignants, ou « Non précisé ».')}
        >
          <MenuItem value={NO_TEACHER}>{t('Non précisé')}</MenuItem>
          {(teachers.data ?? []).map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.displayName}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Annuler')}</Button>
        <Button variant="contained" onClick={save} loading={action.isPending}>
          {t('Enregistrer')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
