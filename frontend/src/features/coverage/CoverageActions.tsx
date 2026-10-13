import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
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
  Hand,
  LifeBuoy,
  QrCode,
  ShieldCheck,
  Timer,
  UserMinus,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { ApiError } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LoadingState } from '../../components/LoadingState';
import { useToast } from '../../components/Toast';
import { icon } from '../../design/tokens';
import { ReasonDialog } from '../requests/ReasonDialog';
import { useCandidates, useCoverageAction, useFormOptions } from './api';
import { CameraCapture, type CapturedPhoto } from './CameraCapture';
import { ACTION_LABELS, PROOF_LABELS, UNAVAILABLE_REASONS } from './labels';
import type { ActionInput, CoverageAction, CoverageDetail } from './types';

type Kind = 'primary' | 'secondary' | 'danger';

const ACTION_STYLE: Record<CoverageAction, { kind: Kind; icon: LucideIcon }> = {
  ACCEPT: { kind: 'primary', icon: Hand },
  DEPART: { kind: 'primary', icon: Footprints },
  CONFIRM_PRESENCE: { kind: 'primary', icon: DoorOpen },
  RELIEVE: { kind: 'primary', icon: CircleCheck },
  VALIDATE: { kind: 'primary', icon: ShieldCheck },
  ASSIGN: { kind: 'primary', icon: UserPlus },
  REASSIGN: { kind: 'secondary', icon: UserPlus },
  WIDEN: { kind: 'secondary', icon: UsersRound },
  EXTEND: { kind: 'secondary', icon: Timer },
  REQUEST_RELIEF: { kind: 'secondary', icon: LifeBuoy },
  RELEASE: { kind: 'danger', icon: UserMinus },
  RELEASE_BY_MANAGER: { kind: 'danger', icon: UserMinus },
  CANCEL: { kind: 'danger', icon: Ban },
};

/** Ordre d'affichage : action principale d'abord, actions destructrices en dernier. */
const ORDER: CoverageAction[] = [
  'ACCEPT',
  'DEPART',
  'CONFIRM_PRESENCE',
  'RELIEVE',
  'VALIDATE',
  'ASSIGN',
  'REASSIGN',
  'WIDEN',
  'EXTEND',
  'REQUEST_RELIEF',
  'RELEASE',
  'RELEASE_BY_MANAGER',
  'CANCEL',
];

const REASON_DIALOGS: Partial<Record<CoverageAction, { title: string; label: string; confirm: string; success: string }>> = {
  RELEASE: {
    title: 'Me désister de cette garde',
    label: 'Motif du désistement',
    confirm: 'Me désister',
    success: 'Désistement enregistré : la demande a été rediffusée.',
  },
  REQUEST_RELIEF: {
    title: 'Demander une relève',
    label: 'Motif de la demande de relève',
    confirm: 'Demander une relève',
    success: 'Relève demandée. Restez en classe jusqu’à l’arrivée de votre remplaçant.',
  },
  CANCEL: {
    title: 'Annuler la demande de couverture',
    label: 'Motif de l’annulation',
    confirm: 'Annuler la demande',
    success: 'Demande annulée. Les employés concernés sont prévenus.',
  },
  RELEASE_BY_MANAGER: {
    title: 'Libérer l’employé de sa garde',
    label: 'Motif de la libération',
    confirm: 'Libérer l’employé',
    success: 'Employé libéré de sa garde.',
  },
};

const SUCCESS: Partial<Record<CoverageAction, string>> = {
  ACCEPT: 'Garde prise. Rendez-vous en classe.',
  DEPART: 'C’est noté : vous êtes en route.',
  CONFIRM_PRESENCE: 'Présence confirmée.',
  RELIEVE: 'Garde terminée.',
  VALIDATE: 'Garde validée et clôturée.',
  ASSIGN: 'Garde affectée.',
  REASSIGN: 'Garde réaffectée.',
  WIDEN: 'Demande élargie au groupe choisi.',
  EXTEND: 'Garde prolongée.',
};

const EXTEND_OPTIONS = [15, 30, 45, 60, 90, 120];

/**
 * Actions d'une couverture : uniquement celles que le serveur autorise (`allowedActions`), qui revérifie
 * tout. Boutons larges sur mobile ; motifs, prolongation, affectation et présence dans des dialogues.
 */
export function CoverageActions({ detail, exclude = [] }: { detail: CoverageDetail; exclude?: CoverageAction[] }) {
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
          toast.success(REASON_DIALOGS[input.action]?.success ?? SUCCESS[input.action] ?? 'Action enregistrée.');
        },
        onError: (e) => {
          const message = e instanceof ApiError ? e.message : 'L’action n’a pas pu être enregistrée. Réessayez.';
          // Dialogues avec zone d'erreur : message sur place ; sinon (motif, action directe) : toast d'erreur.
          if (open && !REASON_DIALOGS[open]) setError(message);
          else toast.error(message);
        },
      },
    );
  }

  function click(action: CoverageAction): void {
    setError(null);
    if (action === 'ACCEPT' || action === 'DEPART') run({ action });
    else setOpen(action);
  }

  const reasonDialog = open ? REASON_DIALOGS[open] : undefined;

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, '& > *': { flex: { xs: '1 1 100%', sm: '0 0 auto' } } }}>
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
          requiredMessage="Le motif est obligatoire."
          confirmLabel={reasonDialog.confirm}
          pending={mutation.isPending}
          onConfirm={(reason) => run({ action: open!, reason })}
          onClose={() => setOpen(null)}
        />
      )}

      <ConfirmDialog
        open={open === 'RELIEVE' || open === 'VALIDATE'}
        title={open === 'VALIDATE' ? 'Valider et clôturer la garde ?' : 'Terminer la garde ?'}
        confirmLabel={open === 'VALIDATE' ? 'Valider et clôturer' : 'Garde terminée'}
        pending={mutation.isPending}
        error={error}
        onConfirm={() => run({ action: open! })}
        onClose={() => setOpen(null)}
      >
        {open === 'VALIDATE'
          ? 'La garde sera clôturée et conservée dans l’historique.'
          : 'À confirmer quand l’enseignant est arrivé en classe. L’heure de fin et la durée sont calculées automatiquement.'}
      </ConfirmDialog>

      <ExtendDialog open={open === 'EXTEND'} pending={mutation.isPending} error={error} onClose={() => setOpen(null)} onConfirm={(minutes) => run({ action: 'EXTEND', minutes })} />

      {(open === 'ASSIGN' || open === 'REASSIGN') && (
        <AssignDialog
          detail={detail}
          action={open}
          pending={mutation.isPending}
          error={error}
          onClose={() => setOpen(null)}
          onConfirm={(assigneeId, force) => run({ action: open, assigneeId, force })}
        />
      )}

      {open === 'WIDEN' && (
        <WidenDialog detail={detail} pending={mutation.isPending} error={error} onClose={() => setOpen(null)} onConfirm={(groupId) => run({ action: 'WIDEN', groupId })} />
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

function ExtendDialog({ open, pending, error, onClose, onConfirm }: DialogBase & { open: boolean; onConfirm: (minutes: number) => void }) {
  const titleId = useId();
  const [minutes, setMinutes] = useState(30);
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>Prolonger la garde</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <TextField select label="Durée supplémentaire" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} sx={{ mt: 1 }}>
          {EXTEND_OPTIONS.map((m) => (
            <MenuItem key={m} value={m}>
              {m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ` ${m % 60}` : ''}`}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="body2" color="text.secondary">
          La prolongation est journalisée et le responsable en est informé.
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

function AssignDialog({
  detail,
  action,
  pending,
  error,
  onClose,
  onConfirm,
}: DialogBase & { detail: CoverageDetail; action: 'ASSIGN' | 'REASSIGN'; onConfirm: (assigneeId: string, force: boolean) => void }) {
  const titleId = useId();
  const candidates = useCandidates(detail.id, true);
  const [selected, setSelected] = useState('');
  const [force, setForce] = useState(false);
  const [touched, setTouched] = useState(false);
  const chosen = candidates.data?.find((c) => c.id === selected);
  const needsForce = chosen !== undefined && !chosen.available;

  function confirm(): void {
    setTouched(true);
    if (!chosen || (needsForce && !force)) return;
    onConfirm(chosen.id, needsForce);
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <DialogTitle id={titleId}>{action === 'ASSIGN' ? 'Affecter la garde' : 'Réaffecter la garde'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        {candidates.isPending ? (
          <LoadingState label="Chargement des employés" variant="inline" />
        ) : candidates.error ? (
          <Alert severity="error">Impossible de charger les employés.</Alert>
        ) : candidates.data.length === 0 ? (
          <Alert severity="info">Aucun employé ne peut recevoir cette garde.</Alert>
        ) : (
          <RadioGroup
            aria-labelledby={titleId}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setForce(false);
            }}
          >
            {candidates.data.map((c) => (
              <FormControlLabel
                key={c.id}
                value={c.id}
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body2">{c.displayName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[c.available ? 'Disponible' : UNAVAILABLE_REASONS[c.reason ?? 'UNAVAILABLE'], c.inTargetGroup ? 'groupe ciblé' : 'hors groupe ciblé']
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                  </Box>
                }
                sx={{ py: 0.5 }}
              />
            ))}
          </RadioGroup>
        )}
        {touched && !chosen && <Alert severity="error">Choisissez un employé.</Alert>}
        {needsForce && (
          <Box>
            <Alert severity="warning" sx={{ mb: 1 }}>
              {chosen.displayName} n’est pas disponible ({UNAVAILABLE_REASONS[chosen.reason ?? 'UNAVAILABLE'].toLowerCase()}).
              L’affectation forcée sera tracée dans l’historique.
            </Alert>
            <FormControlLabel
              control={<Checkbox checked={force} onChange={(e) => setForce(e.target.checked)} />}
              label="Je confirme l’affectation forcée"
            />
            {touched && !force && (
              <Typography variant="caption" color="error" component="p">
                Cochez la confirmation pour forcer l’affectation.
              </Typography>
            )}
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Retour</Button>
        <Button variant="contained" loading={pending} onClick={confirm}>
          {action === 'ASSIGN' ? 'Affecter' : 'Réaffecter'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function WidenDialog({ detail, pending, error, onClose, onConfirm }: DialogBase & { detail: CoverageDetail; onConfirm: (groupId: string) => void }) {
  const titleId = useId();
  const options = useFormOptions();
  const groups = (options.data?.groups ?? []).filter((g) => !detail.groups.some((t) => t.id === g.id));
  const [groupId, setGroupId] = useState('');
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>Élargir à un autre groupe</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        {options.isPending ? (
          <LoadingState label="Chargement des groupes" variant="inline" />
        ) : groups.length === 0 ? (
          <Alert severity="info">Tous les groupes sont déjà ciblés. Vous pouvez affecter quelqu’un manuellement.</Alert>
        ) : (
          <TextField select label="Groupe à ajouter" value={groupId} onChange={(e) => setGroupId(e.target.value)} sx={{ mt: 1 }}>
            {groups.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.name} — {g.availableCount} disponible{g.availableCount > 1 ? 's' : ''}
              </MenuItem>
            ))}
          </TextField>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Retour</Button>
        <Button variant="contained" disabled={!groupId} loading={pending} onClick={() => onConfirm(groupId)}>
          Diffuser au groupe
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
function PresenceDialog({ detail, pending, error, onClose, onConfirm }: DialogBase & { detail: CoverageDetail; onConfirm: (photoFileId: string) => void }) {
  const titleId = useId();
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const needsQr = detail.proofMode !== 'PHOTO';
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <DialogTitle id={titleId}>Confirmer ma présence en classe {detail.class.name}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Preuve demandée : {PROOF_LABELS[detail.proofMode]}. L’heure enregistrée est celle du serveur.
        </Typography>
        {needsQr ? (
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <QrCode size={icon.lg} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
            <Typography variant="body2">
              Ouvrez l’appareil photo de votre téléphone et scannez le QR code affiché dans la classe
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
          <Button variant="contained" disabled={!photo} loading={pending} onClick={() => photo && onConfirm(photo.id)}>
            Confirmer ma présence
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
