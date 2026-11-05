import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { Download, FileUp } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { LoadingState } from '../../components/LoadingState';
import { icon } from '../../design/tokens';
import { isPlural, t } from '../../i18n';
import { csvTemplate, downloadTextFile, IMPORT_MAX_BYTES, readCsvFile, type ImportReport } from './csvImport';

export interface ImportColumn {
  name: string;
  help: string;
  required?: boolean;
}

interface CsvImportDialogProps<R extends ImportReport> {
  title: string;
  /** « 12 comptes » : le nombre accordé avec ce qu'on importe. */
  noun: (count: number) => string;
  columns: readonly ImportColumn[];
  template: { filename: string; headers: readonly string[]; rows: ReadonlyArray<readonly string[]> };
  /** Envoie le fichier au serveur : `dryRun` vrai vérifie sans rien créer. */
  run: (csv: string, dryRun: boolean) => Promise<R>;
  onClose: () => void;
  /** Contenu affiché après la création (par exemple le téléchargement des mots de passe provisoires). */
  renderDone?: (report: R, controls: { markHandled: () => void }) => ReactNode;
  /** Vrai : fermer sans avoir « traité » le résultat (voir `markHandled`) demande une confirmation. */
  requireHandled?: boolean;
  /** Message affiché quand on tente de fermer sans avoir traité le résultat. */
  unhandledWarning?: string;
}

type Phase = 'choose' | 'checking' | 'preview' | 'creating' | 'done';

/**
 * Import d'un fichier CSV en trois temps : choisir le fichier, le voir vérifié en entier (rien n'est créé), puis
 * confirmer. Tout ou rien : tant qu'une ligne est en erreur, la création n'est pas proposée.
 */
export function CsvImportDialog<R extends ImportReport>({
  title,
  noun,
  columns,
  template,
  run,
  onClose,
  renderDone,
  requireHandled = false,
  unhandledWarning,
}: CsvImportDialogProps<R>) {
  const titleId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<R | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [handled, setHandled] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const busy = phase === 'checking' || phase === 'creating';
  const messageOf = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

  async function choose(file: File): Promise<void> {
    setError(null);
    if (file.size > IMPORT_MAX_BYTES) {
      setError(t('Ce fichier dépasse 1 Mo : découpez-le en plusieurs fichiers.'));
      setInputKey((k) => k + 1);
      return;
    }
    setPhase('checking');
    try {
      const text = await readCsvFile(file);
      const checked = await run(text, true);
      setCsv(text);
      setFileName(file.name);
      setReport(checked);
      setPhase('preview');
    } catch (e) {
      setError(messageOf(e, t('Le fichier n’a pas pu être vérifié. Réessayez.')));
      setPhase('choose');
      setInputKey((k) => k + 1);
    }
  }

  async function create(): Promise<void> {
    setError(null);
    setPhase('creating');
    try {
      const result = await run(csv, false);
      setReport(result);
      // Le serveur revérifie tout : si le fichier n'est plus valide (données modifiées entre-temps), on revient à l'aperçu.
      setPhase(result.created ? 'done' : 'preview');
    } catch (e) {
      setError(messageOf(e, t('L’import a échoué. Rien n’a été créé : réessayez.')));
      setPhase('preview');
    }
  }

  function pickAnother(): void {
    setReport(null);
    setCsv('');
    setFileName('');
    setError(null);
    setPhase('choose');
    setInputKey((k) => k + 1);
  }

  function requestClose(): void {
    if (busy) return;
    if (phase === 'done' && requireHandled && !handled && !confirmingClose) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  }

  const downloadTemplate = () => downloadTextFile(template.filename, csvTemplate(template.headers, template.rows));
  const canCreate = phase === 'preview' && report !== null && report.fileErrors.length === 0 && report.invalid === 0 && report.valid > 0;

  return (
    <Dialog open onClose={requestClose} aria-labelledby={titleId} fullWidth maxWidth="md">
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        {phase === 'choose' && (
          <>
            <Typography>
              {t('Choisissez un fichier CSV (enregistré depuis Excel ou LibreOffice). Il est d’abord vérifié en entier : rien n’est créé avant votre confirmation, et rien n’est créé du tout si une ligne est en erreur.')}
            </Typography>
            <Box>
              <Typography component="h3" variant="subtitle2" sx={{ mb: 0.5 }}>
                {t('Colonnes du fichier')}
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.25 }}>
                {columns.map((column) => (
                  <li key={column.name}>
                    <Typography variant="body2" component="span">
                      <strong>{column.name}</strong> {column.required ? t('(obligatoire)') : t('(facultatif)')} : {column.help}
                    </Typography>
                  </li>
                ))}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="contained" startIcon={<FileUp size={icon.sm} aria-hidden="true" />} onClick={() => input.current?.click()}>
                {t('Choisir un fichier')}
              </Button>
              <Button startIcon={<Download size={icon.sm} aria-hidden="true" />} onClick={downloadTemplate}>
                {t('Télécharger le modèle')}
              </Button>
              <input
                key={inputKey}
                ref={input}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                aria-label={t('Fichier CSV à importer')}
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void choose(file);
                }}
              />
            </Box>
          </>
        )}

        {phase === 'checking' && <LoadingState label={t('Vérification du fichier')} variant="inline" />}
        {phase === 'creating' && <LoadingState label={t('Création en cours')} variant="inline" />}

        {(phase === 'preview' || phase === 'creating') && report && (
          <>
            <Typography variant="body2" color="text.secondary">
              {t('Fichier : {name}', { name: fileName })}
            </Typography>
            {report.fileErrors.length > 0 ? (
              <Alert severity="error" role="status">
                <Typography sx={{ fontWeight: 600 }}>{t('Ce fichier ne peut pas être importé.')}</Typography>
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                  {report.fileErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </Box>
              </Alert>
            ) : report.invalid > 0 ? (
              <Alert severity="error" role="status">
                {t(isPlural(report.invalid) ? '{count} lignes à corriger sur {total}. Rien n’est créé tant que le fichier n’est pas corrigé.' : '{count} ligne à corriger sur {total}. Rien n’est créé tant que le fichier n’est pas corrigé.', {
                  count: report.invalid,
                  total: report.total,
                })}
              </Alert>
            ) : (
              <Alert severity="success" role="status">
                {t('Le fichier est valide : {noun} à créer.', { noun: noun(report.valid) })}
              </Alert>
            )}

            {report.issues.length > 0 && (
              <Box component="ul" aria-label={t('Lignes à corriger')} sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1, maxHeight: 280, overflow: 'auto' }}>
                {report.issues.map((issue) => (
                  <Box component="li" key={issue.line} sx={{ borderLeft: 3, borderColor: 'error.main', pl: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {t('Ligne {line} — {label}', { line: issue.line, label: issue.label })}
                    </Typography>
                    {issue.errors.map((message) => (
                      <Typography key={message} variant="body2">
                        {message}
                      </Typography>
                    ))}
                  </Box>
                ))}
              </Box>
            )}
            {report.truncated && (
              <Typography variant="body2" color="text.secondary">
                {t('Seules les premières erreurs sont affichées : corrigez-les puis rechargez le fichier pour voir la suite.')}
              </Typography>
            )}

            {report.invalid === 0 && report.fileErrors.length === 0 && report.preview.length > 0 && (
              <Box>
                <Typography component="h3" variant="subtitle2" sx={{ mb: 0.5 }}>
                  {t('Aperçu des premières lignes')}
                </Typography>
                <Box component="ul" aria-label={t('Aperçu des premières lignes')} sx={{ m: 0, pl: 2.5 }}>
                  {report.preview.map((row) => (
                    <li key={row.line}>
                      <Typography variant="body2" component="span">
                        {row.label}
                        {row.detail && <Typography component="span" variant="body2" color="text.secondary"> — {row.detail}</Typography>}
                      </Typography>
                    </li>
                  ))}
                </Box>
              </Box>
            )}
          </>
        )}

        {phase === 'done' && report && (
          <>
            <Alert severity="success" role="status">
              {t(isPlural(report.count) ? '{noun} créés.' : '{noun} créé.', { noun: noun(report.count) })}
            </Alert>
            {renderDone?.(report, { markHandled: () => setHandled(true) })}
            {confirmingClose && unhandledWarning && (
              <Alert severity="warning" role="alert">
                {unhandledWarning}
              </Alert>
            )}
          </>
        )}

        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {phase === 'preview' && (
          <Button onClick={pickAnother}>{canCreate ? t('Choisir un autre fichier') : t('Choisir un fichier corrigé')}</Button>
        )}
        <Button onClick={requestClose} disabled={busy}>
          {phase === 'done' ? (confirmingClose ? t('Fermer sans télécharger') : t('Fermer')) : t('Annuler')}
        </Button>
        {canCreate && report && (
          <Button variant="contained" onClick={() => void create()}>
            {t('Créer {noun}', { noun: noun(report.valid) })}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
