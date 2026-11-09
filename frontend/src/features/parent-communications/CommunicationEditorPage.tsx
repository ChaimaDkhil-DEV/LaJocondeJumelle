import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError, loadErrorMessage } from '../../api/client';
import { useClientSettings } from '../../api/settings';
import { uploadFile } from '../../api/uploads';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { t } from '../../i18n';
import { VoicePlayer } from '../voice/VoicePlayer';
import { VoiceRecorder, type VoiceRecording } from '../voice/VoiceRecorder';
import {
  fullName,
  useCommunicationMutations,
  useMyCommunication,
  useTeacherStudents,
  type CommunicationDetail,
  type GuardianRef,
} from './api';
import {
  CommunicationHistory,
  CommunicationStatusBadge,
  RemarkAndVoice,
} from './CommunicationParts';

const REMARK_MAX = 2000;
const INCOMPLETE = t('Ajoutez la remarque écrite et le message vocal avant de soumettre.');
const BACK = { to: '/communications-parents', label: t('Communication avec les parents') };

/** Création ou suivi d'une communication (015, US1, US4) ; remonte à chaque changement d'identifiant. */
export function CommunicationEditorPage() {
  const { id } = useParams();
  const detail = useMyCommunication(id);
  if (!id) return <Editor key="new" detail={null} />;
  if (detail.isPending) return <LoadingState label={t('Chargement de la communication')} />;
  if (detail.error)
    return (
      <ErrorState
        message={loadErrorMessage(detail.error, t('la communication'))}
        actionLabel={t('Réessayer')}
        onAction={() => void detail.refetch()}
      />
    );
  return <Editor key={`${detail.data.id}-${detail.data.version}`} detail={detail.data} />;
}

function Editor({ detail }: { detail: CommunicationDetail | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { voiceMaxSeconds } = useClientSettings();
  const students = useTeacherStudents();
  const { create, update, submit, cancel } = useCommunicationMutations();

  const editable =
    !detail || detail.status === 'DRAFT' || detail.status === 'RETURNED_FOR_CORRECTION';
  const [studentId, setStudentId] = useState(detail?.student.id ?? '');
  const [guardianId, setGuardianId] = useState(detail?.guardian.id ?? '');
  const [text, setText] = useState(detail?.draft?.text ?? '');
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'submit' | 'cancel' | null>(null);

  const existingVoice = detail?.draft?.voice ?? null;
  const student = students.data?.find((s) => s.id === studentId);
  const guardians: GuardianRef[] = student?.guardians ?? (detail ? [detail.guardian] : []);

  if (!editable && detail) return <ReadOnly detail={detail} />;

  const dirty =
    !detail ||
    text !== (detail.draft?.text ?? '') ||
    recording !== null ||
    guardianId !== detail.guardian.id;

  /** Enregistre le brouillon (vocal téléversé d'abord) ; renvoie la communication à jour. */
  async function save(): Promise<CommunicationDetail> {
    const voiceFileId = recording
      ? (await uploadFile('VOICE', recording.blob, 'message-vocal.webm')).id
      : undefined;
    if (!detail) {
      return create.mutateAsync({
        studentId,
        guardianId,
        text: text.trim() || null,
        voiceFileId: voiceFileId ?? null,
      });
    }
    if (!dirty) return detail;
    return update.mutateAsync({
      id: detail.id,
      version: detail.version,
      ...(text !== (detail.draft?.text ?? '') ? { text: text.trim() || null } : {}),
      ...(voiceFileId ? { voiceFileId } : {}),
      ...(guardianId !== detail.guardian.id ? { guardianId } : {}),
    });
  }

  async function run(action: () => Promise<void>): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : t('L’action n’a pas pu être enregistrée. Réessayez.'),
      );
    } finally {
      setBusy(false);
    }
  }

  function saveDraft(): void {
    if (!studentId || !guardianId) {
      setError(t('Choisissez l’élève et le représentant destinataire.'));
      return;
    }
    void run(async () => {
      const saved = await save();
      toast.success(t('Brouillon enregistré.'));
      if (!detail) navigate(`/communications-parents/${saved.id}`, { replace: true });
    });
  }

  function askSubmit(): void {
    if (!studentId || !guardianId) {
      setError(t('Choisissez l’élève et le représentant destinataire.'));
      return;
    }
    if (!text.trim() || (!recording && !existingVoice)) {
      setError(INCOMPLETE);
      return;
    }
    setError(null);
    setConfirm('submit');
  }

  function doSubmit(): void {
    void run(async () => {
      const saved = await save();
      const sent = await submit.mutateAsync({ id: saved.id, version: saved.version });
      setConfirm(null);
      toast.success(t('Communication soumise à l’administration.'));
      navigate(`/communications-parents/${sent.id}`, { replace: true });
    }).finally(() => setConfirm(null));
  }

  function doCancel(): void {
    if (!detail) return;
    void run(async () => {
      await cancel.mutateAsync({ id: detail.id, version: detail.version });
      toast.success(t('Communication annulée.'));
    }).finally(() => setConfirm(null));
  }

  return (
    <Box>
      <PageHeader
        title={
          detail
            ? t('Communication pour {name}', { name: fullName(detail.student) })
            : t('Nouvelle communication')
        }
        back={BACK}
        breadcrumb={false}
      />
      <Paper
        variant="elevated"
        sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2.5, maxWidth: 720 }}
      >
        {detail && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <CommunicationStatusBadge status={detail.status} />
          </Box>
        )}
        {detail?.status === 'RETURNED_FOR_CORRECTION' && detail.decisionReason && (
          <Alert severity="warning">
            <strong>{t('Motif du retour :')}</strong> {detail.decisionReason}
          </Alert>
        )}
        {detail ? (
          <Typography>
            {t('Élève : {name} — {className}', {
              name: fullName(detail.student),
              className: detail.student.class.name,
            })}
          </Typography>
        ) : (
          <TextField
            select
            id="pc-eleve"
            label={t('Élève')}
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setGuardianId('');
            }}
            helperText={
              students.data?.length === 0
                ? t(
                    'Aucun élève dans vos classes. Demandez à l’administration de vous attribuer vos classes.',
                  )
                : undefined
            }
          >
            {(students.data ?? []).map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {fullName(s)} — {s.class.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          select
          id="pc-representant"
          label={t('Représentant destinataire')}
          value={guardianId}
          onChange={(e) => setGuardianId(e.target.value)}
          disabled={!studentId}
        >
          {guardians.map((g) => (
            <MenuItem key={g.id} value={g.id}>
              {fullName(g)}
              {g.relationship ? ` (${g.relationship})` : ''}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          id="pc-remarque"
          label={t('Remarque écrite')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          multiline
          minRows={4}
          slotProps={{ htmlInput: { maxLength: REMARK_MAX } }}
          helperText={t('{count} / {max} caractères', { count: text.length, max: REMARK_MAX })}
        />
        <Box sx={{ display: 'grid', gap: 1 }}>
          <Typography variant="subtitle2" component="h2">
            {t('Message vocal')}
          </Typography>
          {existingVoice && !recording && (
            <Box sx={{ display: 'grid', gap: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {t(
                  'Vocal enregistré : écoutez-le, ou réenregistrez-le ci-dessous pour le remplacer.',
                )}
              </Typography>
              <VoicePlayer
                key={existingVoice.id}
                src={`/api/files/${existingVoice.id}`}
                durationSeconds={existingVoice.durationSeconds ?? undefined}
              />
            </Box>
          )}
          <VoiceRecorder maxSeconds={voiceMaxSeconds} value={recording} onChange={setRecording} />
        </Box>
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button variant="contained" onClick={askSubmit} disabled={busy}>
            {t('Soumettre à l’administration')}
          </Button>
          <Button variant="outlined" onClick={saveDraft} loading={busy && confirm === null}>
            {t('Enregistrer le brouillon')}
          </Button>
          {detail && (
            <Button color="error" onClick={() => setConfirm('cancel')} disabled={busy}>
              {t('Annuler la communication')}
            </Button>
          )}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {t(
            'Une fois soumise, la communication ne peut plus être modifiée tant que l’administration ne l’a pas examinée.',
          )}
        </Typography>
      </Paper>
      {detail && detail.events.length > 0 && (
        <Paper variant="elevated" sx={{ p: { xs: 2, sm: 3 }, mt: 2, maxWidth: 720 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            {t('Historique')}
          </Typography>
          <CommunicationHistory events={detail.events} />
        </Paper>
      )}
      <ConfirmDialog
        open={confirm === 'submit'}
        title={t('Soumettre à l’administration ?')}
        confirmLabel={t('Soumettre')}
        pending={busy}
        onConfirm={doSubmit}
        onClose={() => setConfirm(null)}
      >
        {t(
          'La communication sera examinée avant d’être publiée au parent. Vous ne pourrez plus la modifier pendant l’examen.',
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'cancel'}
        title={t('Annuler cette communication ?')}
        confirmLabel={t('Annuler la communication')}
        cancelLabel={t('Garder')}
        pending={busy}
        onConfirm={doCancel}
        onClose={() => setConfirm(null)}
      >
        {t('Elle ne sera jamais envoyée au parent. Cette action est définitive.')}
      </ConfirmDialog>
    </Box>
  );
}

/** Communication en attente ou finale : la dernière version soumise, en lecture seule. */
function ReadOnly({ detail }: { detail: CommunicationDetail }) {
  const latest = detail.revisions.at(-1);
  return (
    <Box>
      <PageHeader
        title={t('Communication pour {name}', { name: fullName(detail.student) })}
        back={BACK}
        breadcrumb={false}
      />
      <Paper
        variant="elevated"
        sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2, maxWidth: 720 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <CommunicationStatusBadge status={detail.status} />
          {latest && (
            <Typography color="text.secondary">
              {t('version {number}', { number: latest.number })}
            </Typography>
          )}
        </Box>
        {detail.decisionReason && (
          <Alert severity={detail.status === 'REJECTED' ? 'error' : 'info'}>
            <strong>{t('Motif :')}</strong> {detail.decisionReason}
          </Alert>
        )}
        <Typography>
          {t('Élève : {name} — {className}', {
            name: fullName(detail.student),
            className: detail.student.class.name,
          })}
          <br />
          {t('Destinataire : {name}', { name: fullName(detail.guardian) })}
        </Typography>
        <RemarkAndVoice
          text={latest?.text ?? detail.draft?.text ?? null}
          voiceFileId={latest?.voiceFileId ?? detail.draft?.voice?.id ?? null}
          durationSeconds={latest?.durationSeconds ?? detail.draft?.voice?.durationSeconds}
        />
      </Paper>
      <Paper variant="elevated" sx={{ p: { xs: 2, sm: 3 }, mt: 2, maxWidth: 720 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
          {t('Historique')}
        </Typography>
        <CommunicationHistory events={detail.events} />
      </Paper>
    </Box>
  );
}
