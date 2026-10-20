import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  Ban,
  CircleCheck,
  DoorOpen,
  Footprints,
  LifeBuoy,
  Pencil,
  QrCode,
  ShieldCheck,
  Timer,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { ApiError } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LoadingState } from '../../components/LoadingState';
import { useToast } from '../../components/Toast';
import { icon } from '../../design/tokens';
import { ReasonDialog } from '../requests/ReasonDialog';
import { useCandidates, useCoverageAction } from './api';
import { CameraCapture, type CapturedPhoto } from './CameraCapture';
import { ACTION_LABELS, PROOF_LABELS, UNAVAILABLE_REASONS } from './labels';
import type { ActionInput, CoverageAction, CoverageDetail } from './types';

type Kind = 'primary' | 'secondary' | 'danger';

const ACTION_STYLE: Record<CoverageAction, { kind: Kind; icon: LucideIcon }> = {
  DEPART: { kind: 'primary', icon: Footprints },
  CONFIRM_PRESENCE: { kind: 'primary', icon: DoorOpen },
  RELIEVE: { kind: 'primary', icon: CircleCheck },
  VALIDATE: { kind: 'primary', icon: ShieldCheck },
  ASSIGN: { kind: 'primary', icon: UserPlus },
  REASSIGN: { kind: 'secondary', icon: UserPlus },
  UPDATE: { kind: 'secondary', icon: Pencil },
  EXTEND: { kind: 'secondary', icon: Timer },
  REQUEST_RELIEF: { kind: 'secondary', icon: LifeBuoy },
  SET_TEACHER: { kind: 'secondary', icon: Pencil },
  RELEASE_SUPPORT: { kind: 'secondary', icon: Users },
  RELEASE_BY_MANAGER: { kind: 'danger', icon: UserMinus },
  WITHDRAW: { kind: 'danger', icon: Ban },
  CANCEL: { kind: 'danger', icon: Ban },
};

/**
 * Ordre d'affichage : action principale d'abord, actions destructrices en dernier. La modification
 * d'une demande (UPDATE), la correction de l'enseignant et la libération d'un renfort ont leurs
 * propres écrans (formulaire de l'enseignant, détail de l'admin).
 */
const ORDER: CoverageAction[] = [
  'DEPART',
  'CONFIRM_PRESENCE',
  'RELIEVE',
  'VALIDATE',
  'ASSIGN',
  'REASSIGN',
  'EXTEND',
  'REQUEST_RELIEF',
  'RELEASE_BY_MANAGER',
  'WITHDRAW',
  'CANCEL',
];

interface ReasonConfig {
  title: string;
  label: string;
  confirm: string;
  success: string;
  /** Motif facultatif (annulation, retrait : FR-008a, FR-008g). */
  optional?: boolean;
}

const REASON_DIALOGS: Partial<Record<CoverageAction, ReasonConfig>> = {
  REQUEST_RELIEF: {
    title: 'Demander une relève',
    label: 'Motif de la demande de relève',
    confirm: 'Demander une relève',
    success: 'Relève demandée. Restez en classe jusqu’à l’arrivée de votre remplaçant.',
  },
  CANCEL: {
    title: 'Annuler l’affectation',
    label: 'Motif de l’annulation (facultatif)',
    confirm: 'Annuler l’affectation',
    success: 'Affectation annulée. Les personnes concernées sont prévenues.',
    optional: true,
  },
  WITHDRAW: {
    title: 'Retirer la demande',
    label: 'Motif du retrait (facultatif)',
    confirm: 'Retirer la demande',
    success: 'Demande retirée.',
    optional: true,
  },
  RELEASE_BY_MANAGER: {
    title: 'Libérer le surveillant',
    label: 'Motif de la libération',
    confirm: 'Libérer le surveillant',
    success: 'Surveillant libéré de son affectation.',
  },
};

const SUCCESS: Partial<Record<CoverageAction, string>> = {
  DEPART: 'C’est noté : vous êtes en route.',
  CONFIRM_PRESENCE: 'Présence confirmée.',
  RELIEVE: 'Affectation terminée.',
  VALIDATE: 'Affectation validée et clôturée.',
  ASSIGN: 'Surveillant assigné.',
  REASSIGN: 'Affectation réassignée.',
  EXTEND: 'Affectation prolongée.',
};

const EXTEND_OPTIONS = [15, 30, 45, 60, 90, 120];

/**
 * Actions d'une affectation : uniquement celles que le serveur autorise (`allowedActions`), qui revérifie
 * tout. Boutons larges sur mobile ; motifs, prolongation, assignation et présence dans des dialogues.
 */
export function CoverageActions({
  detail,
  exclude = [],
}: {
  detail: CoverageDetail;
  exclude?: CoverageAction[];
}) {
  const toast = useToast();
  const mutation = useCoverageAction(detail.id);
  const [open, setOpen] = useState<CoverageAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actions = ORDER.filter((a) => detail.allowedActions.includes(a) && !exclude.includes(a));
  if (actions.length === 0) return null;

  function run(input: Omit<ActionInput, 'version'>): void {
    setError(null);
    mutation.mutate(
      { ...input, version: detail.version },
      {
        onSuccess: () => {
          setOpen(null);
          toast.success(
            REASON_DIALOGS[input.action]?.success ?? SUCCESS[input.action] ?? 'Action enregistrée.',
          );
        },
        onError: (e) => {
          const message =
            e instanceof ApiError ? e.message : 'L’action n’a pas pu être enregistrée. Réessayez.';
          // Dialogues avec zone d'erreur : message sur place ; sinon (motif, action directe) : toast d'erreur.
          if (open && !REASON_DIALOGS[open]) setError(message);
          else toast.error(message);
        },
      },
    );
  }

  function click(action: CoverageAction): void {
    setError(null);
    if (action === 'DEPART') run({ action });
    else setOpen(action);
  }

  const reasonDialog = open ? REASON_DIALOGS[open] : undefined;

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          '& > *': { flex: { xs: '1 1 100%', sm: '0 0 auto' } },
        }}
      >
        {actions.map((action) => {
          const { kind, icon: Icon } = ACTION_STYLE[action];
          return (
            <Button
              key={action}
              size="large"
              variant={kind === 'primary' ? 'contained' : 'outlined'}
              color={kind === 'danger' ? 'error' : 'primary'}
              startIcon={<Icon size={icon.md} aria-hidden="true" />}
              loading={mutation.isPending && mutation.variables?.action === action && !open}
              onClick={() => click(action)}
            >
              {ACTION_LABELS[action]}
            </Button>
          );
        })}
      </Box>

      {reasonDialog && (
        <ReasonDialog
          open
          title={reasonDialog.title}
          label={reasonDialog.label}
          optional={reasonDialog.optional}
          confirmLabel={reasonDialog.confirm}
          pending={mutation.isPending}
          onConfirm={(reason) => run({ action: open!, ...(reason ? { reason } : {}) })}
          onClose={() => setOpen(null)}
        />
      )}

      <ConfirmDialog
        open={open === 'RELIEVE' || open === 'VALIDATE'}
        title={
          open === 'VALIDATE' ? 'Valider et clôturer l’affectation ?' : 'Terminer l’affectation ?'
        }
        confirmLabel={open === 'VALIDATE' ? 'Valider et clôturer' : 'Terminer'}
        pending={mutation.isPending}
        error={error}
        onConfirm={() => run({ action: open! })}
        onClose={() => setOpen(null)}
      >
        {open === 'VALIDATE'
          ? 'L’affectation sera clôturée et conservée dans l’historique.'
          : 'À confirmer quand l’enseignant est arrivé en classe. L’heure de fin et la durée sont calculées automatiquement.'}
      </ConfirmDialog>

      <ExtendDialog
        open={open === 'EXTEND'}
        pending={mutation.isPending}
        error={error}
        onClose={() => setOpen(null)}
        onConfirm={(minutes) => run({ action: 'EXTEND', minutes })}
      />

      {(open === 'ASSIGN' || open === 'REASSIGN') && (
        <AssignDialog
          detail={detail}
          action={open}
          pending={mutation.isPending}
          error={error}
          onClose={() => setOpen(null)}
          onConfirm={(assigneeId) => run({ action: open, assigneeId })}
        />
      )}

      {open === 'CONFIRM_PRESENCE' && (
        <PresenceDialog
          detail={detail}
          pending={mutation.isPending}
          error={error}
          onClose={() => setOpen(null)}
          onConfirm={(photoFileId) => run({ action: 'CONFIRM_PRESENCE', photoFileId })}
        />
      )}
    </>
  );
}

interface DialogBase {
  pending: boolean;
  error: string | null;
  onClose: () => void;
}

function ExtendDialog({
  open,
  pending,
  error,
  onClose,
  onConfirm,
}: DialogBase & { open: boolean; onConfirm: (minutes: number) => void }) {
  const titleId = useId();
  const [minutes, setMinutes] = useState(30);
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>Prolonger l’affectation</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <TextField
          select
          label="Durée supplémentaire"
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          sx={{ mt: 1 }}
        >
          {EXTEND_OPTIONS.map((m) => (
            <MenuItem key={m} value={m}>
              {m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ` ${m % 60}` : ''}`}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="body2" color="text.secondary">
          La prolongation est journalisée et l’admin en est informé.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Retour</Button>
        <Button variant="contained" loading={pending} onClick={() => onConfirm(minutes)}>
          Prolonger
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Assignation par l'admin (FR-009, FR-010) : surveillants de l'étage de la classe d'abord ; les
 * indisponibles sont listés avec leur raison mais ne peuvent pas être choisis (plus de forçage).
 */
function AssignDialog({
  detail,
  action,
  pending,
  error,
  onClose,
  onConfirm,
}: DialogBase & {
  detail: CoverageDetail;
  action: 'ASSIGN' | 'REASSIGN';
  onConfirm: (assigneeId: string) => void;
}) {
  const titleId = useId();
  const candidates = useCandidates(detail.id, true);
  const [selected, setSelected] = useState('');
  const [touched, setTouched] = useState(false);
  const chosen = candidates.data?.find((c) => c.id === selected && c.available);
  const title = action === 'ASSIGN' ? 'Assigner un surveillant' : 'Réassigner l’affectation';

  function confirm(): void {
    setTouched(true);
    if (chosen) onConfirm(chosen.id);
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        {action === 'REASSIGN' &&
          (detail.status === 'ON_DUTY' || detail.status === 'RELIEF_PENDING') && (
            <Alert severity="info">
              {detail.assignee?.displayName ?? 'Le surveillant actuel'} reste en classe jusqu’à ce
              que le nouveau surveillant confirme sa présence.
            </Alert>
          )}
        {candidates.isPending ? (
          <LoadingState label="Chargement des surveillants" variant="inline" />
        ) : candidates.error ? (
          <Alert severity="error">Impossible de charger les surveillants.</Alert>
        ) : candidates.data.length === 0 ? (
          <Alert severity="info">Aucun surveillant dans le groupe Surveillants.</Alert>
        ) : (
          <RadioGroup
            aria-labelledby={titleId}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {candidates.data.map((c) => (
              <FormControlLabel
                key={c.id}
                value={c.id}
                disabled={!c.available}
                control={<Radio />}
                label={[
                  c.displayName,
                  c.floor?.name ?? 'sans étage',
                  c.available ? 'Disponible' : UNAVAILABLE_REASONS[c.reason ?? 'UNAVAILABLE'],
                ].join(' · ')}
                sx={{ py: 0.5 }}
              />
            ))}
          </RadioGroup>
        )}
        {touched && !chosen && (
          <Alert severity="error">Choisissez un surveillant disponible.</Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Retour</Button>
        <Button variant="contained" loading={pending} onClick={confirm}>
          {action === 'ASSIGN' ? 'Assigner' : 'Réassigner'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Confirmation de présence. Preuve « photo » : capture directe ici. Preuve « QR » ou « QR + photo » :
 * l'employé scanne le QR code de la classe avec l'appareil photo du téléphone ; la page ouverte par le QR
 * demande la photo si nécessaire, puis la validation explicite.
 */
function PresenceDialog({
  detail,
  pending,
  error,
  onClose,
  onConfirm,
}: DialogBase & { detail: CoverageDetail; onConfirm: (photoFileId: string) => void }) {
  const titleId = useId();
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const needsQr = detail.proofMode !== 'PHOTO';
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <DialogTitle id={titleId}>Confirmer ma présence en classe {detail.class.name}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Preuve demandée : {PROOF_LABELS[detail.proofMode]}. L’heure enregistrée est celle du
          serveur.
        </Typography>
        {needsQr ? (
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <QrCode size={icon.lg} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
            <Typography variant="body2">
              Ouvrez l’appareil photo de votre téléphone et scannez le QR code affiché dans la
              classe
              {detail.class.room ? ` (${detail.class.room})` : ''}. Une page s’ouvrira pour
              {detail.proofMode === 'BOTH' ? ' prendre la photo et' : ''} confirmer votre présence.
            </Typography>
          </Box>
        ) : (
          <CameraCapture value={photo} onChange={setPhoto} />
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{needsQr ? 'Fermer' : 'Retour'}</Button>
        {!needsQr && (
          <Button
            variant="contained"
            disabled={!photo}
            loading={pending}
            onClick={() => photo && onConfirm(photo.id)}
          >
            Confirmer ma présence
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
