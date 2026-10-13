import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Check, Copy } from 'lucide-react';
import { useId, useState } from 'react';
import { icon } from '../../design/tokens';

interface TemporaryPasswordDialogProps {
  /** Mot de passe et nom du compte ; null : fenêtre fermée. Le parent l'oublie à la fermeture. */
  value: { password: string; displayName: string } | null;
  onClose: () => void;
}

/** Affiche une seule fois le mot de passe provisoire renvoyé par le serveur. */
export function TemporaryPasswordDialog({ value, onClose }: TemporaryPasswordDialogProps) {
  const titleId = useId();
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');

  async function copyPassword(): Promise<void> {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value.password);
      setCopy('done');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <Dialog
      open={value !== null}
      // Fermeture uniquement par le bouton : le mot de passe ne doit pas être perdu par un clic à côté.
      onClose={(_event, reason) => {
        if (reason !== 'backdropClick') onClose();
      }}
      aria-labelledby={titleId}
      slotProps={{ transition: { onExited: () => setCopy('idle') } }}
    >
      <DialogTitle id={titleId}>Mot de passe provisoire</DialogTitle>
      {value && (
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Mot de passe provisoire de {value.displayName} :
          </Typography>
          <TextField
            id="mot-de-passe-provisoire"
            label="Mot de passe"
            value={value.password}
            fullWidth
            onFocus={(e) => e.target.select()}
            slotProps={{ htmlInput: { readOnly: true, spellCheck: false, style: { fontFamily: 'monospace', fontSize: '1.25rem' } } }}
          />
          <Alert severity="warning" sx={{ mt: 2 }}>
            Ce mot de passe ne sera plus affiché. Transmettez-le à la personne : elle devra le changer à sa première connexion.
          </Alert>
          <Typography role="status" sx={{ mt: 1, minHeight: '1.5em' }} color={copy === 'failed' ? 'error' : 'text.secondary'}>
            {copy === 'done' ? 'Mot de passe copié.' : copy === 'failed' ? 'Copie impossible : notez le mot de passe.' : ''}
          </Typography>
        </DialogContent>
      )}
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button
          variant="outlined"
          startIcon={copy === 'done' ? <Check size={icon.sm} aria-hidden="true" /> : <Copy size={icon.sm} aria-hidden="true" />}
          onClick={() => void copyPassword()}
        >
          Copier le mot de passe
        </Button>
        <Button variant="contained" onClick={onClose}>
          J’ai noté le mot de passe
        </Button>
      </DialogActions>
    </Dialog>
  );
}
