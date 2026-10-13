import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import { ChevronDown, ChevronUp, Radio as RadioIcon, School, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { useClientSettings } from '../../api/settings';
import type { Priority } from '../../api/types';
import { uploadFile } from '../../api/uploads';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { PRIORITY_LABELS } from '../../components/PriorityBadge';
import { useToast } from '../../components/Toast';
import { fieldIcon } from '../../components/fieldIcon';
import { icon, layout } from '../../design/tokens';
import { VoiceRecorder, type VoiceRecording } from '../voice/VoiceRecorder';
import { extensionFor } from '../voice/recorderFormat';
import { useCreateCoverage, useFormOptions } from './api';

const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'NORMAL'];
/** Durées proposées ; vide = jusqu'à l'arrivée de l'enseignant. */
const DURATIONS = [30, 60, 90, 120, 180, 240];

/** Date ISO d'aujourd'hui à l'heure choisie (heure locale du poste ; le serveur borne la valeur). */
function todayAt(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toISOString();
}

/**
 * Création rapide d'une demande de couverture : classe, groupe cible, priorité, « Diffuser ».
 * Options repliées : heure de début, durée, enseignant absent, consigne écrite ou vocale.
 */
export function CreateCoveragePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const options = useFormOptions();
  const create = useCreateCoverage();
  const { voiceMaxSeconds } = useClientSettings();

  const [clientId] = useState(() => crypto.randomUUID());
  const [classId, setClassId] = useState('');
  const [groupIds, setGroupIds] = useState<string[] | null>(null);
  const [priority, setPriority] = useState<Priority>('URGENT');
  const [more, setMore] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState<number | ''>('');
  const [absentTeacher, setAbsentTeacher] = useState('');
  const [note, setNote] = useState('');
  const [voice, setVoice] = useState<VoiceRecording | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const header = <PageHeader title="Nouvelle demande de couverture" back={{ to: '/gardes', label: 'Gardes' }} />;
  if (options.isPending) return (<>{header}<LoadingState label="Chargement du formulaire" variant="form" /></>);
  if (options.error) {
    const forbidden = options.error instanceof ApiError && options.error.status === 403;
    return (
      <>
        {header}
        <ErrorState message={forbidden ? 'Seuls les responsables peuvent diffuser une demande de couverture.' : 'Impossible de charger le formulaire.'} />
      </>
    );
  }

  const { categories, classes, groups } = options.data;
  // Par défaut : tous les groupes actifs comptant au moins un employé disponible (sinon le premier).
  const selectedGroups = groupIds ?? (groups.some((g) => g.availableCount > 0) ? groups.filter((g) => g.availableCount > 0).map((g) => g.id) : groups.slice(0, 1).map((g) => g.id));
  const availableCount = groups.filter((g) => selectedGroups.includes(g.id)).reduce((sum, g) => sum + g.availableCount, 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!classId) next.classId = 'Choisissez la classe à surveiller.';
    if (selectedGroups.length === 0) next.groupIds = 'Choisissez au moins un groupe d’employés.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitError(null);
    try {
      setUploading(Boolean(voice));
      const voiceFileId = voice ? (await uploadFile('VOICE', voice.blob, `message-vocal.${extensionFor(voice.mimeType)}`)).id : undefined;
      setUploading(false);
      const created = await create.mutateAsync({
        clientId,
        categoryId: categories[0].id,
        classId,
        groupIds: selectedGroups,
        priority,
        ...(startTime ? { startAt: todayAt(startTime) } : {}),
        ...(duration ? { estimatedMinutes: duration } : {}),
        ...(absentTeacher.trim() ? { absentTeacher: absentTeacher.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(voiceFileId ? { voiceFileId } : {}),
      });
      if (created.notifiedCount === 0) {
        toast.info('Demande diffusée, mais aucun employé disponible n’a été prévenu : élargissez ou affectez manuellement.');
      } else {
        toast.success(`Demande diffusée à ${created.notifiedCount} employé${created.notifiedCount > 1 ? 's' : ''}.`);
      }
      navigate(`/gardes/${created.id}`, { replace: true });
    } catch (e) {
      setUploading(false);
      setSubmitError(e instanceof ApiError ? e.message : 'La demande n’a pas pu être diffusée. Réessayez.');
    }
  }

  return (
    <>
      {header}
      <Box component="form" noValidate onSubmit={(e: FormEvent<HTMLFormElement>) => void handleSubmit(e)} sx={{ maxWidth: layout.readable }}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 3 }}>
          {submitError && <Alert severity="error">{submitError}</Alert>}

          <TextField
            select
            id="coverage-class"
            label="Classe"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            error={Boolean(errors.classId)}
            helperText={errors.classId ?? (classes.length === 0 ? 'Aucune classe : le super administrateur doit d’abord les créer.' : undefined)}
            slotProps={{ input: fieldIcon(School) }}
          >
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.room ? `${c.name} — ${c.room}` : c.name}
              </MenuItem>
            ))}
          </TextField>

          <FormControl component="fieldset" error={Boolean(errors.groupIds)}>
            <FormLabel component="legend" sx={{ mb: 0.5 }}>
              Groupe d’employés prévenu
            </FormLabel>
            <FormGroup>
              {groups.map((g) => (
                <FormControlLabel
                  key={g.id}
                  control={
                    <Checkbox
                      checked={selectedGroups.includes(g.id)}
                      onChange={(e) =>
                        setGroupIds(e.target.checked ? [...selectedGroups, g.id] : selectedGroups.filter((id) => id !== g.id))
                      }
                    />
                  }
                  label={`${g.name} — ${g.availableCount} disponible${g.availableCount > 1 ? 's' : ''} sur ${g.memberCount}`}
                />
              ))}
            </FormGroup>
            {errors.groupIds && <FormHelperText>{errors.groupIds}</FormHelperText>}
          </FormControl>

          {selectedGroups.length > 0 && availableCount === 0 && (
            <Alert severity="warning" icon={<TriangleAlert size={icon.lg} aria-hidden="true" />}>
              <strong>Aucun employé disponible dans ce groupe.</strong> Cochez un autre groupe, ou diffusez quand même
              puis affectez quelqu’un manuellement depuis la demande.
            </Alert>
          )}

          <TextField select id="coverage-priority" label="Priorité" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <MenuItem key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </MenuItem>
            ))}
          </TextField>

          <Box>
            <Button
              onClick={() => setMore((v) => !v)}
              aria-expanded={more}
              aria-controls="coverage-more"
              startIcon={more ? <ChevronUp size={icon.md} aria-hidden="true" /> : <ChevronDown size={icon.md} aria-hidden="true" />}
            >
              Heure, durée, enseignant absent, consigne
            </Button>
          </Box>
          <Collapse in={more} id="coverage-more" unmountOnExit>
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
                <TextField
                  id="coverage-start"
                  type="time"
                  label="Début (vide = maintenant)"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
                <TextField select id="coverage-duration" label="Durée estimée" value={duration} onChange={(e) => setDuration(e.target.value === '' ? '' : Number(e.target.value))}>
                  <MenuItem value="">Jusqu’à l’arrivée de l’enseignant</MenuItem>
                  {DURATIONS.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d < 60 ? `${d} min` : `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60}` : ''}`}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <TextField
                id="coverage-teacher"
                label="Enseignant absent (facultatif)"
                value={absentTeacher}
                onChange={(e) => setAbsentTeacher(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
              <TextField
                id="coverage-note"
                label="Consigne (facultative)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 1000 } }}
              />
              <FormControl component="fieldset">
                <FormLabel component="legend" sx={{ mb: 1 }}>
                  Message vocal (facultatif)
                </FormLabel>
                <VoiceRecorder maxSeconds={voiceMaxSeconds} value={voice} onChange={setVoice} />
              </FormControl>
            </Box>
          </Collapse>
        </Paper>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button
            type="submit"
            variant="contained"
            size="large"
            loading={create.isPending || uploading}
            startIcon={<RadioIcon size={icon.md} aria-hidden="true" />}
            sx={{ minWidth: { xs: '100%', sm: 200 } }}
          >
            Diffuser
          </Button>
        </Box>
      </Box>
    </>
  );
}
