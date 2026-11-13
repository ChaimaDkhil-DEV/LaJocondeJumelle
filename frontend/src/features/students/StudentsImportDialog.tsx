import { CsvImportDialog, type ImportColumn } from '../admin/CsvImportDialog';
import type { ImportReport } from '../admin/csvImport';
import { isPlural, t } from '../../i18n';
import { useImportStudents } from './api';

const noun = (count: number) => t(isPlural(count) ? '{count} élèves' : '{count} élève', { count });

const COLUMNS: readonly ImportColumn[] = [
  { name: 'prenom', required: true, help: t('prénom de l’élève') },
  { name: 'nom', required: true, help: t('nom de famille de l’élève') },
  { name: 'classe', required: true, help: t('nom exact d’une classe rattachée à un niveau scolaire') },
  { name: 'telephone_parent', required: true, help: t('téléphone d’un parent, par exemple 06 12 34 56 78 ou +216 20 123 456') },
];

const TEMPLATE = {
  filename: 'modele-eleves.csv',
  headers: ['prenom', 'nom', 'classe', 'telephone_parent'],
  rows: [
    ['Amine', 'Ben Salah', '1re année primaire - Rose', '+216 20 123 456'],
    ['Lina', 'Hammami', '1re année primaire - Rose', '+216 98 765 432'],
  ],
};

/** Import d'élèves depuis un fichier CSV (super administrateur). */
export function StudentsImportDialog({ onClose }: { onClose: () => void }) {
  const importStudents = useImportStudents();
  return (
    <CsvImportDialog<ImportReport>
      title={t('Importer des élèves')}
      noun={noun}
      columns={COLUMNS}
      template={TEMPLATE}
      run={(csv, dryRun) => importStudents.mutateAsync({ csv, dryRun })}
      onClose={onClose}
    />
  );
}
