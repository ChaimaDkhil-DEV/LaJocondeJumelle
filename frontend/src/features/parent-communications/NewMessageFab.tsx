import Fab from '@mui/material/Fab';
import { Plus } from 'lucide-react';
import { t } from '../../i18n';
import { BOTTOM_BAR_HEIGHT } from './CommunicationsBottomBar';

/**
 * Bouton flottant « ＋ » : l'unique action principale de la liste. Fixé à l'écran sur mobile (au-dessus
 * de la barre du bas), posé dans le coin de la liste sur grand écran pour ne pas recouvrir la saisie.
 */
export function NewMessageFab({ onClick }: { onClick: () => void }) {
  return (
    <Fab
      color="primary"
      aria-label={t('Nouveau message')}
      onClick={onClick}
      sx={(theme) => ({
        position: 'fixed',
        right: 16,
        bottom: `calc(${BOTTOM_BAR_HEIGHT + 16}px + env(safe-area-inset-bottom))`,
        zIndex: theme.zIndex.appBar - 1,
        [theme.breakpoints.up('md')]: { position: 'absolute', bottom: 16 },
      })}
    >
      <Plus size={26} aria-hidden="true" />
    </Fab>
  );
}
