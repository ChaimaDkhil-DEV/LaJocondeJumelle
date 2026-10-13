import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import GlobalStyles from '@mui/material/GlobalStyles';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { CircleOff, Pencil, Printer, QrCode, RefreshCcw, School } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { Badge } from '../../components/Badge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { IconAction } from '../../components/IconAction';
import { LoadingState } from '../../components/LoadingState';
import { SectionHeader } from '../../components/SectionHeader';
import { useToast } from '../../components/Toast';
import { font, icon } from '../../design/tokens';
import { useAdminClasses, useClassQr, useRevokeQr, useSaveClass, type AdminClass } from './adminApi';

function ClassFormDialog({ schoolClass, onClose, onSaved }: { schoolClass: AdminClass | null; onClose: () => void; onSaved: (message: string) => void }) {
  const titleId = useId();
  const save = useSaveClass();
  const [name, setName] = useState(schoolClass?.name ?? '');
  const [room, setRoom] = useState(schoolClass?.room ?? '');
  const [active, setActive] = useState(schoolClass?.active ?? true);
  const [nameError, setNameError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!name.trim()) {
      setNameError('Le nom est obligatoire.');
      return;
    }
    setNameError(null);
    save.mutate(
      { id: schoolClass?.id, name: name.trim(), ...(room.trim() ? { room: room.trim() } : {}), active },
      { onSuccess: () => onSaved(schoolClass ? 'Classe enregistrée.' : 'Classe créée.') },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{schoolClass ? `Modifier : ${schoolClass.name}` : 'Nouvelle classe'}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          <TextField
            id="classe-nom"
            label="Nom de la classe"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={Boolean(nameError)}
            helperText={nameError ?? 'Par exemple : 1ère année Violet.'}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <TextField id="classe-salle" label="Salle ou lieu (facultatif)" value={room} onChange={(e) => setRoom(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />
          {schoolClass && <FormControlLabel control={<Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Classe active" />}
          {save.error && <Alert severity="error">{save.error instanceof ApiError ? save.error.message : 'Enregistrement impossible.'}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="contained" loading={save.isPending}>
            Enregistrer la classe
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/**
 * QR code imprimable de la classe : lien signé (non devinable) vers la page de confirmation de présence.
 * Révocation : les QR imprimés deviennent invalides ; le nouveau QR est à réimprimer.
 */
function QrDialog({ schoolClass, onClose }: { schoolClass: AdminClass; onClose: () => void }) {
  const titleId = useId();
  const toast = useToast();
  const qr = useClassQr(schoolClass.id);
  const revoke = useRevokeQr();
  const [image, setImage] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  useEffect(() => {
    if (!qr.data) return;
    let cancelled = false;
    void QRCode.toDataURL(qr.data.url, { errorCorrectionLevel: 'M', margin: 2, width: 512 }).then((url) => {
      if (!cancelled) setImage(url);
    });
    return () => {
      cancelled = true;
    };
  }, [qr.data]);

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      {/* Impression : seule la fiche du QR code est imprimée. */}
      <GlobalStyles
        styles={{
          '@media print': {
            'body *': { visibility: 'hidden' },
            '.qr-print, .qr-print *': { visibility: 'visible' },
            '.qr-print': { position: 'fixed', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' },
          },
        }}
      />
      <DialogTitle id={titleId}>QR code : {schoolClass.name}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        {qr.error ? (
          <Alert severity="error">Impossible de générer le QR code.</Alert>
        ) : qr.isPending || !image ? (
          <LoadingState label="Génération du QR code" variant="inline" />
        ) : (
          <Box className="qr-print" sx={{ display: 'grid', justifyItems: 'center', gap: 1.5, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: font.medium, fontSize: 24 }}>{schoolClass.name}</Typography>
            {schoolClass.room && <Typography color="text.secondary">{schoolClass.room}</Typography>}
            <Box component="img" src={image} alt={`QR code de la classe ${schoolClass.name}`} sx={{ width: 280, maxWidth: '100%', height: 'auto' }} />
            <Typography variant="body2">Garde : scannez ce code avec l’appareil photo de votre téléphone pour confirmer votre présence.</Typography>
            <Typography variant="caption" color="text.secondary">
              Version {qr.data.version}
            </Typography>
          </Box>
        )}
        <Alert severity="info">
          Ce code n’enregistre rien à lui seul : l’employé confirme ensuite sa présence, et le serveur vérifie la classe et sa garde.
        </Alert>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button color="error" startIcon={<RefreshCcw size={icon.sm} aria-hidden="true" />} onClick={() => setConfirmRevoke(true)}>
          Révoquer et régénérer
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Fermer</Button>
        <Button variant="contained" startIcon={<Printer size={icon.sm} aria-hidden="true" />} disabled={!image} onClick={() => window.print()}>
          Imprimer
        </Button>
      </DialogActions>
      <ConfirmDialog
        open={confirmRevoke}
        title="Révoquer le QR code ?"
        confirmLabel="Révoquer"
        pending={revoke.isPending}
        error={revoke.error instanceof ApiError ? revoke.error.message : null}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={() =>
          revoke.mutate(schoolClass.id, {
            onSuccess: () => {
              setConfirmRevoke(false);
              setImage(null);
              toast.success('Ancien QR code révoqué. Imprimez le nouveau et remplacez-le dans la classe.');
            },
          })
        }
      >
        Les QR codes déjà imprimés pour cette classe ne fonctionneront plus. Il faudra imprimer et afficher le nouveau.
      </ConfirmDialog>
    </Dialog>
  );
}

/** Classes et salles, avec leur QR code de présence imprimable. */
export function ClassesAdminPage() {
  const classes = useAdminClasses();
  const toast = useToast();
  const [form, setForm] = useState<{ schoolClass: AdminClass | null } | null>(null);
  const [qr, setQr] = useState<AdminClass | null>(null);

  return (
    <Box component="section" aria-labelledby="titre-classes">
      <SectionHeader
        id="titre-classes"
        title="Classes et QR codes"
        description="Chaque classe a un QR code unique, à afficher près de la porte, pour confirmer la présence en garde."
        action={
          <Button variant="contained" startIcon={<School size={icon.sm} aria-hidden="true" />} onClick={() => setForm({ schoolClass: null })}>
            Nouvelle classe
          </Button>
        }
      />
      {classes.isPending ? (
        <LoadingState label="Chargement des classes" />
      ) : classes.error ? (
        <ErrorState message="Impossible de charger les classes." actionLabel="Réessayer" onAction={() => void classes.refetch()} />
      ) : classes.data.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState icon={School} title="Aucune classe" description="Ajoutez les classes et salles à couvrir, par exemple « 1ère année Violet »." />
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box component="ul" aria-label="Classes" sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
            {classes.data.map((c) => (
              <Box component="li" key={c.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', px: { xs: 2, md: 2.5 }, py: 1.5 }}>
                <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: font.medium }}>{c.name}</Typography>
                    {!c.active && (
                      <Badge tone="neutral" icon={CircleOff}>
                        Inactive
                      </Badge>
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {[c.room, `QR version ${c.qrVersion}`].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flex: 'none' }}>
                  <IconAction icon={QrCode} label={`QR code de la classe ${c.name}`} tooltip="QR code" onClick={() => setQr(c)} />
                  <IconAction icon={Pencil} label={`Modifier la classe ${c.name}`} tooltip="Modifier" onClick={() => setForm({ schoolClass: c })} />
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
      {form && (
        <ClassFormDialog
          schoolClass={form.schoolClass}
          onClose={() => setForm(null)}
          onSaved={(message) => {
            setForm(null);
            toast.success(message);
          }}
        />
      )}
      {qr && <QrDialog schoolClass={qr} onClose={() => setQr(null)} />}
    </Box>
  );
}
