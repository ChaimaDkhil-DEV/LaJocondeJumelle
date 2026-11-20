import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, Printer, Search, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { Badge } from '../../components/Badge';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { IconAction } from '../../components/IconAction';
import { LoadingState } from '../../components/LoadingState';
import { font, fontSize, icon } from '../../design/tokens';
import { t } from '../../i18n';
import { useCurrentUser } from '../auth/useCurrentUser';
import { SituationView } from './SituationView';
import { auditEntryLabel } from '../admin/labels';
import { useAskSituation, useClassHistory, useStudentAudit, type ClassPeriod } from './studentSituationApi';
import type { Student } from './api';

function PeriodItem({ period }: { period: ClassPeriod }) {
  const current = period.endedAt === null;
  return (
    <Box component="li" sx={{ display: 'grid', gap: 0.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontWeight: font.semibold, overflowWrap: 'anywhere' }}>{period.class.name}</Typography>
        {current && <Badge tone="info">{t('Classe actuelle')}</Badge>}
        {period.availability === 'PROBABLE' && (
          <Badge tone="warning" icon={CircleAlert}>
            {t('Probable')}
          </Badge>
        )}
        {period.availability === 'KNOWN' && !current && (
          <Badge tone="neutral" icon={CircleCheck}>
            {t('Enregistrée')}
          </Badge>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary">
        {[period.class.level, period.class.floor, period.class.room].filter(Boolean).join(' · ')}
      </Typography>
      <Typography variant="body2">
        {period.endedAt
          ? t('Du {from} au {to}', { from: formatDateTime(period.startedAt), to: formatDateTime(period.endedAt) })
          : t('Depuis le {from}', { from: formatDateTime(period.startedAt) })}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {period.changedBy ? t('Changement fait par {name}', { name: period.changedBy.displayName }) : t('Reprise de la classe actuelle, sans auteur')}
      </Typography>
      {period.warning && (
        <Typography variant="body2" sx={{ fontWeight: font.medium }}>
          {period.warning}
        </Typography>
      )}
    </Box>
  );
}

/** Journal de l'élève : modifications de sa fiche et consultations de sa situation, chargé à l'ouverture seulement. */
function StudentAuditPanel({ student }: { student: Student }) {
  const [open, setOpen] = useState(false);
  const audit = useStudentAudit(student.id, open);
  const entries = audit.data?.pages.flatMap((p) => p.items) ?? [];
  const panelId = useId();
  return (
    <Box component="section" aria-label={t('Journal de l’élève')} className="no-print" sx={{ display: 'grid', gap: 1 }}>
      <Button variant="text" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)} endIcon={open ? <ChevronUp size={icon.sm} aria-hidden="true" /> : <ChevronDown size={icon.sm} aria-hidden="true" />} sx={{ justifySelf: 'start' }}>
        {t('Journal de l’élève')}
      </Button>
      <Box id={panelId} hidden={!open}>
        {open && audit.isPending && <LoadingState label={t('Chargement du journal')} />}
        {open && audit.error && <ErrorState message={t('Impossible de charger le journal.')} actionLabel={t('Réessayer')} onAction={() => void audit.refetch()} />}
        {open && audit.data && entries.length === 0 && <Typography variant="body2">{t('Aucune entrée pour cet élève.')}</Typography>}
        {open && entries.length > 0 && (
          <Box component="ul" aria-label={t('Journal de l’élève')} sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
            {entries.map((e) => (
              <Box component="li" key={e.id} sx={{ display: 'grid', gap: 0.25, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: font.medium }}>
                  {auditEntryLabel(e.action, e.details as Record<string, unknown> | null)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatDateTime(e.createdAt)} · {e.actor?.displayName ?? t('Système')}
                </Typography>
                {e.details && (
                  <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                    {Object.entries(e.details)
                      .map(([key, value]) => `${key} : ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
                      .join(' · ')}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
        {open && audit.hasNextPage && (
          <Button variant="outlined" size="small" disabled={audit.isFetchingNextPage} onClick={() => void audit.fetchNextPage()} sx={{ mt: 1 }}>
            {t('Afficher plus')}
          </Button>
        )}
      </Box>
    </Box>
  );
}

/** Demande de la situation de l'élève à une date et une heure précises, puis affichage (021). */
function SituationPanel({ student }: { student: Student }) {
  const [at, setAt] = useState('');
  const [missing, setMissing] = useState(false);
  const ask = useAskSituation(student.id);
  const me = useCurrentUser();
  const fieldId = useId();
  const refused = ask.error instanceof ApiError && ask.error.status === 400 ? ask.error.message : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!at) return setMissing(true);
    setMissing(false);
    ask.mutate(at);
  };

  return (
    <Box component="section" aria-label={t('Situation à un instant donné')} sx={{ display: 'grid', gap: 1.5 }}>
      <Typography component="h3" sx={{ fontSize: fontSize.md, fontWeight: font.semibold }} className="no-print">
        {t('Situation à un instant donné')}
      </Typography>
      <Box component="form" noValidate onSubmit={submit} className="no-print" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1 }}>
        <TextField
          id={fieldId}
          type="datetime-local"
          size="small"
          label={t('Date et heure')}
          value={at}
          onChange={(e) => setAt(e.target.value)}
          error={missing || refused !== null}
          helperText={missing ? t('Indiquez la date et l’heure.') : (refused ?? t('Heure de l’école.'))}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ flex: '1 1 220px' }}
        />
        <Button type="submit" variant="contained" disabled={ask.isPending} startIcon={<Search size={icon.sm} aria-hidden="true" />}>
          {t('Voir la situation')}
        </Button>
      </Box>
      {ask.isPending && <LoadingState label={t('Chargement de la situation')} />}
      {ask.error && refused === null && <ErrorState message={t('Impossible d’afficher la situation.')} actionLabel={t('Réessayer')} onAction={() => at && ask.mutate(at)} />}
      {ask.data && (
        <>
          <SituationView situation={ask.data} editor={me.data?.displayName ?? t('un administrateur')} />
          <Box className="no-print">
            <Button variant="outlined" startIcon={<Printer size={icon.sm} aria-hidden="true" />} onClick={() => window.print()}>
              {t('Imprimer la situation')}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}

interface StudentHistoryDrawerProps {
  student: Student | null;
  onClose: () => void;
}

/** Classes successives d'un élève (021) : qui l'a changé de classe, quand ; ouvert depuis la liste des élèves. */
export function StudentHistoryDrawer({ student, onClose }: StudentHistoryDrawerProps) {
  const titleId = useId();
  const history = useClassHistory(student?.id ?? null);
  const name = student ? `${student.firstName} ${student.lastName}` : '';
  return (
    <Drawer
      anchor="right"
      open={student !== null}
      onClose={onClose}
      slotProps={{ paper: { role: 'dialog', 'aria-labelledby': titleId, sx: { width: { xs: '100%', sm: 560 }, p: { xs: 2, sm: 3 }, display: 'grid', alignContent: 'start', gap: 2 } } }}
    >
      {student && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <Typography id={titleId} component="h2" variant="h6" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: fontSize.lg }}>
              {t('Historique de classe : {name}', { name })}
            </Typography>
            <IconAction icon={X} label={t('Fermer l’historique')} tooltip={t('Fermer')} onClick={onClose} />
          </Box>
          {history.isPending ? (
            <LoadingState label={t('Chargement de l’historique')} />
          ) : history.error ? (
            <ErrorState message={t('Impossible de charger l’historique.')} actionLabel={t('Réessayer')} onAction={() => void history.refetch()} />
          ) : (
            <Box component="ul" aria-label={t('Périodes de classe')} sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
              {history.data.items.map((period) => (
                <PeriodItem key={period.id} period={period} />
              ))}
            </Box>
          )}
          <SituationPanel student={student} />
          <StudentAuditPanel student={student} />
        </>
      )}
    </Drawer>
  );
}
