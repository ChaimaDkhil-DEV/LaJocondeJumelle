import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { Download } from 'lucide-react';
import { icon } from '../../design/tokens';
import { isPlural, t } from '../../i18n';
import { useImportAccounts } from './api';
import { CsvImportDialog, type ImportColumn } from './CsvImportDialog';
import { downloadTextFile, type AccountsImportReport } from './csvImport';

const noun = (count: number) => t(isPlural(count) ? '{count} comptes' : '{count} compte', { count });

const COLUMNS: readonly ImportColumn[] = [
  { name: 'identifiant', required: true, help: t('lettres minuscules sans accent, chiffres, point, tiret ou souligné (3 à 64 caractères)') },
  { name: 'nom_affiche', required: true, help: t('nom complet, tel qu’il s’affichera') },
  { name: 'fonction', help: t('poste, par exemple Professeur') },
  { name: 'role', help: t('employé (par défaut) ou admin') },
  { name: 'groupes', help: t('noms de groupes séparés par « | », par exemple Enseignants|Surveillants') },
  { name: 'etage', help: t('nom d’un étage existant (pour les surveillants)') },
  { name: 'categories', help: t('catégories dont la personne reçoit les demandes, séparées par « | »') },
];

const TEMPLATE = {
  filename: 'modele-comptes.csv',
  headers: ['identifiant', 'nom_affiche', 'fonction', 'role', 'groupes', 'etage', 'categories'],
  rows: [
    ['amine.bensalah', 'Amine Ben Salah', 'Professeur', 'employé', 'Enseignants', '', ''],
    ['sarra.trabelsi', 'Sarra Trabelsi', 'Surveillante', 'employé', 'Surveillants', '1er étage', ''],
  ],
};

/** Les mots de passe provisoires sont affichés une seule fois : le fichier à remettre aux personnes se télécharge ici. */
function Passwords({ report, onHandled }: { report: AccountsImportReport; onHandled: () => void }) {
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {/* Information statique : seule la tentative de fermer sans télécharger est une alerte. */}
      <Alert severity="warning" role="note">
        {t('Les mots de passe provisoires ne seront plus affichés nulle part. Téléchargez le fichier maintenant, remettez à chaque personne le sien (elle devra le changer à sa première connexion), puis supprimez le fichier.')}
      </Alert>
      <Box>
        <Button
          variant="contained"
          startIcon={<Download size={icon.sm} aria-hidden="true" />}
          onClick={() => {
            downloadTextFile('mots-de-passe-provisoires.csv', report.passwordsCsv ?? '');
            onHandled();
          }}
        >
          {t('Télécharger les mots de passe provisoires')}
        </Button>
      </Box>
    </Box>
  );
}

/** Import de comptes depuis un fichier CSV (super administrateur). */
export function AccountsImportDialog({ onClose }: { onClose: () => void }) {
  const importAccounts = useImportAccounts();
  return (
    <CsvImportDialog<AccountsImportReport>
      title={t('Importer des comptes')}
      noun={noun}
      columns={COLUMNS}
      template={TEMPLATE}
      run={(csv, dryRun) => importAccounts.mutateAsync({ csv, dryRun })}
      onClose={onClose}
      requireHandled
      unhandledWarning={t('Vous n’avez pas téléchargé les mots de passe provisoires : ils seront perdus et il faudra réinitialiser chaque compte. Fermer quand même ?')}
      renderDone={(report, { markHandled }) => <Passwords report={report} onHandled={markHandled} />}
    />
  );
}
