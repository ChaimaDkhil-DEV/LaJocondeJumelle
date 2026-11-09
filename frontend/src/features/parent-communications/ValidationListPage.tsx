import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ClipboardCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { t } from '../../i18n';
import { fullName, STATUS_LABELS, useValidationList, type CommunicationSummary } from './api';
import { CommunicationStatusBadge } from './CommunicationParts';

const STATUSES = [
  'PENDING_ADMIN_VALIDATION',
  'RETURNED_FOR_CORRECTION',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'ALL',
] as const;

interface Filters {
  status: (typeof STATUSES)[number];
  teacherId: string;
  classId: string;
  studentId: string;
  from: string;
  to: string;
}

/** Valeurs proposées dans les filtres : celles des communications déjà chargées (aucune liste d'administration requise). */
function optionsOf(
  items: CommunicationSummary[],
  pick: (c: CommunicationSummary) => { id: string; label: string },
) {
  const map = new Map<string, string>();
  for (const c of items) {
    const { id, label } = pick(c);
    map.set(id, label);
  }
  return [...map].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
}

/** « Communications à valider » : permission PARENT_COMMUNICATION_VALIDATE (015, US2). */
export function ValidationListPage() {
  const [filters, setFilters] = useState<Filters>({
    status: 'PENDING_ADMIN_VALIDATION',
    teacherId: '',
    classId: '',
    studentId: '',
    from: '',
    to: '',
  });
  const qs = useMemo(() => {
    const params = new URLSearchParams({ status: filters.status });
    for (const key of ['teacherId', 'classId', 'studentId', 'from', 'to'] as const)
      if (filters[key]) params.set(key, filters[key]);
    return params.toString();
  }, [filters]);
  const list = useValidationList(qs);
  // Options stables : mémorisées à partir de tout ce qui a été chargé.
  const [seen, setSeen] = useState<CommunicationSummary[]>([]);
  if (list.data && list.data.some((c) => !seen.some((s) => s.id === c.id)))
    setSeen([...seen, ...list.data.filter((c) => !seen.some((s) => s.id === c.id))]);
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const teachers = optionsOf(seen, (c) => ({ id: c.teacher.id, label: c.teacher.displayName }));
  const classes = optionsOf(seen, (c) => ({ id: c.student.class.id, label: c.student.class.name }));
  const students = optionsOf(seen, (c) => ({ id: c.student.id, label: fullName(c.student) }));

  return (
    <Box>
      <PageHeader
        title={t('Communications à valider')}
        description={t(
          'Approuvez, retournez pour correction ou rejetez les communications des enseignants aux parents.',
        )}
      />
      <Paper
        variant="elevated"
        sx={{
          p: 2,
          mb: 2,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        <TextField
          select
          id="pcv-statut"
          label={t('Statut')}
          size="small"
          value={filters.status}
          onChange={(e) => set({ status: e.target.value as Filters['status'] })}
        >
          {STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {s === 'ALL' ? t('Tous') : STATUS_LABELS[s]}
            </MenuItem>
          ))}
        </TextField>
        {(
          [
            ['teacherId', t('Enseignant'), teachers],
            ['classId', t('Classe'), classes],
            ['studentId', t('Élève'), students],
          ] as const
        ).map(([key, label, options]) => (
          <TextField
            key={key}
            select
            id={`pcv-${key}`}
            label={label}
            size="small"
            value={filters[key]}
            onChange={(e) => set({ [key]: e.target.value })}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">{t('Tous')}</MenuItem>
            {options.map(([id, name]) => (
              <MenuItem key={id} value={id}>
                {name}
              </MenuItem>
            ))}
          </TextField>
        ))}
        <TextField
          id="pcv-du"
          type="date"
          label={t('Soumise depuis le')}
          size="small"
          value={filters.from}
          onChange={(e) => set({ from: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          id="pcv-au"
          type="date"
          label={t('Jusqu’au')}
          size="small"
          value={filters.to}
          onChange={(e) => set({ to: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Paper>
      {list.isPending ? (
        <LoadingState label={t('Chargement des communications')} />
      ) : list.error ? (
        <ErrorState
          message={loadErrorMessage(list.error, t('les communications'))}
          actionLabel={t('Réessayer')}
          onAction={() => void list.refetch()}
        />
      ) : list.data.length === 0 ? (
        <Paper variant="elevated">
          <EmptyState
            icon={ClipboardCheck}
            title={t('Aucune communication')}
            description={t('Aucune communication ne correspond à ces filtres.')}
          />
        </Paper>
      ) : (
        <Box
          component="ul"
          aria-label={t('Communications')}
          sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}
        >
          {list.data.map((c) => (
            <Paper
              component="li"
              key={c.id}
              variant="elevated"
              sx={{ p: 2, display: 'grid', gap: 0.5 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Box
                  component={RouterLink}
                  to={`/communications-a-valider/${c.id}`}
                  sx={{ fontWeight: 600, color: 'text.primary' }}
                >
                  {fullName(c.student)} — {c.student.class.name}
                </Box>
                <CommunicationStatusBadge status={c.status} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {c.teacher.displayName} → {fullName(c.guardian)}
                {c.submittedAt
                  ? ` · ${t('soumise le {date}', { date: formatDateTime(c.submittedAt) })}`
                  : ''}
                {c.currentRevision > 1
                  ? ` · ${t('version {number}', { number: c.currentRevision })}`
                  : ''}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
