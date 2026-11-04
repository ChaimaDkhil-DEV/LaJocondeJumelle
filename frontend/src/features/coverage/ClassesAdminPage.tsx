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
import { useAdminClasses, useAdminFloors, useClassQr, useRevokeQr, useSaveClass, type AdminClass } from './adminApi';
import { t } from '../../i18n';

function ClassFormDialog({ schoolClass, onClose, onSaved }: { schoolClass: AdminClass | null; onClose: () => void; onSaved: (message: string) => void }) {
  const titleId = useId();
  const save = useSaveClass();
  const floors = useAdminFloors();
  const [name, setName] = useState(schoolClass?.name ?? '');
  const [floorId, setFloorId] = useState(schoolClass?.floor?.id ?? '');
  const [floorError, setFloorError] = useState<string | null>(null);
  const [room, setRoom] = useState(schoolClass?.room ?? '');
  const [active, setActive] = useState(schoolClass?.active ?? true);
  const [nameError, setNameError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setNameError(name.trim() ? null : t('Le nom est obligatoire.'));
    // Étage obligatoire à la création et à la modification (FR-006).
    setFloorError(floorId ? null : t('Choisissez l’étage de la classe.'));
    if (!name.trim() || !floorId) return;
    save.mutate(
      { id: schoolClass?.id, name: name.trim(), ...(room.trim() ? { room: room.trim() } : {}), active, floorId },
      { onSuccess: () => onSaved(schoolClass ? t('Classe enregistrée.') : t('Classe créée.')) },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{schoolClass ? t('Modifier : {name}', { name: schoolClass.name }) : t('Nouvelle classe')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          <TextField
            id="classe-nom"
            label={t('Nom de la classe')}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={Boolean(nameError)}
            helperText={nameError ?? t('Par exemple : 1ère année Violet.')}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <TextField id="classe-salle" label={t('Salle ou lieu (facultatif)')} value={room} onChange={(e) => setRoom(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />
          <TextField
            id="classe-etage"
            select
            label={t('Étage')}
            required
            value={floorId}
            onChange={(e) => setFloorId(e.target.value)}
            error={Boolean(floorError)}
            helperText={floorError ?? t('Les surveillants de cet étage sont proposés en premier.')}
          >
            {(floors.data ?? [])
              .filter((f) => f.active || f.id === floorId)
              .map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name}
                </MenuItem>
              ))}
          </TextField>
          {schoolClass && <FormControlLabel control={<Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />} label={t('Classe active')} />}
          {save.error && <Alert severity="error">{save.error instanceof ApiError ? save.error.message : t('Enregistrement impossible.')}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('Annuler')}</Button>
          <Button type="submit" variant="contained" loading={save.isPending}>
            {t('Enregistrer la classe')}
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
      <DialogTitle id={titleId}>{t('QR code : {name}', { name: schoolClass.name })}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        {qr.error ? (
          <Alert severity="error">{t('Impossible de générer le QR code.')}</Alert>
        ) : qr.isPending || !image ? (
          <LoadingState label={t('Génération du QR code')} variant="inline" />
        ) : (
          <Box className="qr-print" sx={{ display: 'grid', justifyItems: 'center', gap: 1.5, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: font.medium, fontSize: 24 }}>{schoolClass.name}</Typography>
            {schoolClass.room && <Typography color="text.secondary">{schoolClass.room}</Typography>}
            <Box component="img" src={image} alt={t('QR code de la classe {name}', { name: schoolClass.name })} sx={{ width: 280, maxWidth: '100%', height: 'auto' }} />
            <Typography variant="body2">{t('Garde : scannez ce code avec l’appareil photo de votre téléphone pour confirmer votre présence.')}</Typography>
            <Typography variant="caption" color="text.secondary">
              {t('Version {version}', { version: qr.data.version })}
            </Typography>
          </Box>
        )}
        <Alert severity="info">
          {t('Ce code n’enregistre rien à lui seul : l’employé confirme ensuite sa présence, et le serveur vérifie la classe et sa garde.')}
        </Alert>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button color="error" startIcon={<RefreshCcw size={icon.sm} aria-hidden="true" />} onClick={() => setConfirmRevoke(true)}>
          {t('Révoquer et régénérer')}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{t('Fermer')}</Button>
        <Button variant="contained" startIcon={<Printer size={icon.sm} aria-hidden="true" />} disabled={!image} onClick={() => window.print()}>
          {t('Imprimer')}
        </Button>
      </DialogActions>
      <ConfirmDialog
        open={confirmRevoke}
        title={t('Révoquer le QR code ?')}
        confirmLabel={t('Révoquer')}
        pending={revoke.isPending}
        error={revoke.error instanceof ApiError ? revoke.error.message : null}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={() =>
          revoke.mutate(schoolClass.id, {
            onSuccess: () => {
              setConfirmRevoke(false);
              setImage(null);
              toast.success(t('Ancien QR code révoqué. Imprimez le nouveau et remplacez-le dans la classe.'));
            },
          })
        }
      >
        {t('Les QR codes déjà imprimés pour cette classe ne fonctionneront plus. Il faudra imprimer et afficher le nouveau.')}
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
        title={t('Classes et QR codes')}
        description={t('Chaque classe a un QR code unique, à afficher près de la porte, pour confirmer la présence en garde.')}
        action={
          <Button variant="contained" startIcon={<School size={icon.sm} aria-hidden="true" />} onClick={() => setForm({ schoolClass: null })}>
            {t('Nouvelle classe')}
          </Button>
        }
      />
      {classes.isPending ? (
        <LoadingState label={t('Chargement des classes')} />
      ) : classes.error ? (
        <ErrorState message={t('Impossible de charger les classes.')} actionLabel={t('Réessayer')} onAction={() => void classes.refetch()} />
      ) : classes.data.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState icon={School} title={t('Aucune classe')} description={t('Ajoutez les classes et salles à couvrir, par exemple « 1ère année Violet ».')} />
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box component="ul" aria-label={t('Classes')} sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
            {classes.data.map((c) => (
              <Box component="li" key={c.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', px: { xs: 2, md: 2.5 }, py: 1.5 }}>
                <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: font.medium }}>{c.name}</Typography>
                    {!c.active && (
                      <Badge tone="neutral" icon={CircleOff}>
                        {t('Inactive')}
                      </Badge>
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {[c.room, c.floor?.name ?? t('Sans étage'), t('QR version {version}', { version: c.qrVersion })].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flex: 'none' }}>
                  <IconAction icon={QrCode} label={t('QR code de la classe {name}', { name: c.name })} tooltip={t('QR code')} onClick={() => setQr(c)} />
                  <IconAction icon={Pencil} label={t('Modifier la classe {name}', { name: c.name })} tooltip={t('Modifier')} onClick={() => setForm({ schoolClass: c })} />
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
