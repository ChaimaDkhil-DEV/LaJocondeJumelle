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
import { QrScannerDialog } from '../attendance/QrScannerDialog';
import { classIdFromToken } from '../attendance/qrToken';
import { ReasonDialog } from '../requests/ReasonDialog';
import { useCandidates, useCoverageAction } from './api';
import { CameraCapture, type CapturedPhoto } from './CameraCapture';
import { ACTION_LABELS, PROOF_LABELS, UNAVAILABLE_REASONS } from './labels';
import type { ActionInput, CoverageAction, CoverageDetail } from './types';
import { t } from '../../i18n';

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
    title: t('Demander une relève'),
    label: t('Motif de la demande de relève'),
    confirm: t('Demander une relève'),
    success: t('Relève demandée. Restez en classe jusqu’à l’arrivée de votre remplaçant.'),
  },
  CANCEL: {
    title: t('Annuler l’affectation'),
    label: t('Motif de l’annulation (facultatif)'),
    confirm: t('Annuler l’affectation'),
    success: t('Affectation annulée. Les personnes concernées sont prévenues.'),
    optional: true,
  },
  WITHDRAW: {
    title: t('Retirer la demande'),
    label: t('Motif du retrait (facultatif)'),
    confirm: t('Retirer la demande'),
    success: t('Demande retirée.'),
    optional: true,
  },
  RELEASE_BY_MANAGER: {
    title: t('Libérer le surveillant'),
    label: t('Motif de la libération'),
    confirm: t('Libérer le surveillant'),
    success: t('Surveillant libéré de son affectation.'),
  },
};

const SUCCESS: Partial<Record<CoverageAction, string>> = {
  DEPART: t('C’est noté : vous êtes en route.'),
  CONFIRM_PRESENCE: t('Présence confirmée.'),
  RELIEVE: t('Affectation terminée.'),
  VALIDATE: t('Affectation validée et clôturée.'),
  ASSIGN: t('Surveillant assigné.'),
  REASSIGN: t('Affectation réassignée.'),
  EXTEND: t('Affectation prolongée.'),
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
  const [open, setOpen] = useState<CoverageAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Retours au niveau de la mutation : « Terminer » retire la carte (et ce composant) de la liste,
  // parfois avant la réponse ; la confirmation doit s'afficher quand même.
  const mutation = useCoverageAction(detail.id, {
    onSuccess: (_detail, input) => {
      setOpen(null);
      toast.success(
        REASON_DIALOGS[input.action]?.success ?? SUCCESS[input.action] ?? t('Action enregistrée.'),
      );
    },
    onError: (e) => {
      const message =
        e instanceof ApiError ? e.message : t('L’action n’a pas pu être enregistrée. Réessayez.');
      // Dialogues avec zone d'erreur : message sur place ; sinon (motif, action directe) : toast d'erreur.
      if (open && !REASON_DIALOGS[open]) setError(message);
      else toast.error(message);
    },
  });

  const actions = ORDER.filter((a) => detail.allowedActions.includes(a) && !exclude.includes(a));
  if (actions.length === 0) return null;

  function run(input: Omit<ActionInput, 'version'>): void {
    setError(null);
    mutation.mutate({ ...input, version: detail.version });
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
          open === 'VALIDATE' ? t('Valider et clôturer l’affectation ?') : t('Terminer l’affectation ?')
        }
        confirmLabel={open === 'VALIDATE' ? t('Valider et clôturer') : t('Terminer')}
        pending={mutation.isPending}
        error={error}
        onConfirm={() => run({ action: open! })}
        onClose={() => setOpen(null)}
      >
        {open === 'VALIDATE'
          ? t('L’affectation sera clôturée et conservée dans l’historique.')
          : t('À confirmer quand l’enseignant est arrivé en classe. L’heure de fin et la durée sont calculées automatiquement.')}
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
          onConfirm={(proof) => run({ action: 'CONFIRM_PRESENCE', ...proof })}
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
      <DialogTitle id={titleId}>{t('Prolonger l’affectation')}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <TextField
          select
          label={t('Durée supplémentaire')}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          sx={{ mt: 1 }}
        >
          {EXTEND_OPTIONS.map((m) => (
            <MenuItem key={m} value={m}>
              {m < 60
                ? t('{m} min', { m })
                : t('{h} h{rest}', { h: m / 60, rest: m % 60 ? ` ${m % 60}` : '' })}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="body2" color="text.secondary">
          {t('La prolongation est journalisée et l’admin en est informé.')}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Retour')}</Button>
        <Button variant="contained" loading={pending} onClick={() => onConfirm(minutes)}>
          {t('Prolonger')}
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
  const title = action === 'ASSIGN' ? t('Assigner un surveillant') : t('Réassigner l’affectation');

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
              {t('{name} reste en classe jusqu’à ce que le nouveau surveillant confirme sa présence.', {
                name: detail.assignee?.displayName ?? t('Le surveillant actuel'),
              })}
            </Alert>
          )}
        {candidates.isPending ? (
          <LoadingState label={t('Chargement des surveillants')} variant="inline" />
        ) : candidates.error ? (
          <Alert severity="error">{t('Impossible de charger les surveillants.')}</Alert>
        ) : candidates.data.length === 0 ? (
          <Alert severity="info">{t('Aucun surveillant dans le groupe Surveillants.')}</Alert>
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
                  c.floor?.name ?? t('sans étage'),
                  c.available ? t('Disponible') : UNAVAILABLE_REASONS[c.reason ?? 'UNAVAILABLE'],
                ].join(' · ')}
                sx={{ py: 0.5 }}
              />
            ))}
          </RadioGroup>
        )}
        {touched && !chosen && (
          <Alert severity="error">{t('Choisissez un surveillant disponible.')}</Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Retour')}</Button>
        <Button variant="contained" loading={pending} onClick={confirm}>
          {action === 'ASSIGN' ? t('Assigner') : t('Réassigner')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Confirmation de présence. Preuve « photo » : capture directe ici, puis « Confirmer ma présence ». Preuve
 * « QR » : le QR code de la classe est scanné dans l'application et la présence part dès la lecture, comme
 * la déclaration d'une classe vide (013). Preuve « QR + photo » : les deux, dans l'ordre voulu ; la présence
 * part dès que les deux sont faits. Le serveur revérifie le QR (signature, version, classe de la garde) ;
 * la page ouverte par l'appareil photo du téléphone (PresencePage) reste inchangée.
 */
function PresenceDialog({
  detail,
  pending,
  error,
  onClose,
  onConfirm,
}: DialogBase & { detail: CoverageDetail; onConfirm: (proof: { qrToken?: string; photoFileId?: string }) => void }) {
  const titleId = useId();
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [scanning, setScanning] = useState(false);
  /** QR lu en attendant la photo (preuve « QR + photo », scan fait en premier). */
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const needsQr = detail.proofMode !== 'PHOTO';
  const needsPhoto = detail.proofMode !== 'QR';
  const room = detail.class.room ? ` (${detail.class.room})` : '';

  /** Envoie la présence ; après un refus du serveur, un nouveau scan renvoie, la photo reste. */
  function send(token: string, withPhoto: CapturedPhoto | null): void {
    setQrToken(null);
    onConfirm({ qrToken: token, ...(withPhoto ? { photoFileId: withPhoto.id } : {}) });
  }

  function scanned(token: string): void {
    setScanning(false);
    const classId = classIdFromToken(token);
    if (classId && classId !== detail.class.id.toLowerCase()) {
      setQrError(
        t('Ce QR code correspond à une autre classe que celle de votre garde : scannez celui de la classe {name}.', {
          name: detail.class.name,
        }),
      );
      return;
    }
    setQrError(null);
    if (needsPhoto && !photo) setQrToken(token);
    else send(token, photo);
  }

  function photoTaken(next: CapturedPhoto | null): void {
    setPhoto(next);
    if (next && needsQr && qrToken) send(qrToken, next);
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <DialogTitle id={titleId}>
        {t('Confirmer ma présence en classe {name}', { name: detail.class.name })}
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {t('Preuve demandée : {proof}. L’heure enregistrée est celle du serveur.', {
            proof: PROOF_LABELS[detail.proofMode],
          })}
        </Typography>
        {needsQr && (
          <>
            <Typography variant="body2">
              {needsPhoto
                ? t(
                    'Prenez la photo et scannez le QR code affiché dans la classe{room}, dans l’ordre que vous voulez : la présence est confirmée dès que les deux sont faits.',
                    { room },
                  )
                : t('Scannez le QR code affiché dans la classe{room} : la présence est confirmée dès qu’il est lu.', { room })}
            </Typography>
            <Button
              variant="contained"
              size="large"
              startIcon={<QrCode size={icon.md} aria-hidden="true" />}
              disabled={pending}
              onClick={() => {
                setQrError(null);
                setScanning(true);
              }}
              sx={{ minHeight: 48 }}
            >
              {t('Scanner le QR code de la classe')}
            </Button>
            {qrToken && (
              <Alert severity="success" role="status">
                {t('QR code de la classe lu : prenez maintenant la photo.')}
              </Alert>
            )}
            {qrError && (
              <Alert severity="warning" role="status">
                {qrError}
              </Alert>
            )}
          </>
        )}
        {needsPhoto && <CameraCapture value={photo} onChange={photoTaken} />}
        {needsQr && pending && (
          <Typography variant="body2" role="status">
            {t('Confirmation de la présence…')}
          </Typography>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{needsQr ? t('Fermer') : t('Retour')}</Button>
        {!needsQr && (
          <Button
            variant="contained"
            disabled={!photo}
            loading={pending}
            onClick={() => photo && onConfirm({ photoFileId: photo.id })}
          >
            {t('Confirmer ma présence')}
          </Button>
        )}
      </DialogActions>
      {scanning && <QrScannerDialog onToken={scanned} onClose={() => setScanning(false)} />}
    </Dialog>
  );
}
