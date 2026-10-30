import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  Download,
  Eye,
  EllipsisVertical,
  Pencil,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { ApiError, apiFetch, loadErrorMessage } from '../../api/client';
import type { Role } from '../../api/types';
import { Badge } from '../../components/Badge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { useToast } from '../../components/Toast';
import { UserAvatar } from '../../components/UserAvatar';
import { visuallyHidden } from '../../components/a11y';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';
import { useCurrentUser } from '../auth/useCurrentUser';
import { AvatarDialog } from '../avatar/AvatarDialog';
import { adminKeys, useAdminUsers, type AdminUser } from './api';
import { DashboardSkeleton } from './DashboardSkeleton';
import {
  dashboardKeys,
  formatDurationMs,
  useDashboardEmployees,
  type EmployeeStats,
} from './dashboardApi';
import { EmployeeDrawer } from './EmployeeDrawer';
import { ROLE_LABELS } from './labels';
import { TemporaryPasswordDialog } from './TemporaryPasswordDialog';
import { UserFormDialog } from './UserFormDialog';

type StatusFilter = '' | 'active' | 'inactive';
type Person = EmployeeStats['user'];

const ROWS_PER_PAGE = [10, 25, 50];

/** Recherche sans accents ni casse, sur le nom, la fonction et le rôle. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr');
}

function matches(e: EmployeeStats, query: string, role: Role | '', status: StatusFilter): boolean {
  if (role && e.user.role !== role) return false;
  if (status === 'active' && !e.user.active) return false;
  if (status === 'inactive' && e.user.active) return false;
  const q = normalize(query.trim());
  return (
    !q ||
    normalize(
      `${e.user.displayName} ${e.user.jobTitle ?? ''} ${ROLE_LABELS[e.user.role]}`,
    ).includes(q)
  );
}

/** Export CSV des employés sélectionnés (indicateurs de la période ; séparateur « ; », tableur français). */
function downloadCsv(rows: EmployeeStats[]): void {
  const header = [
    'Employé',
    'Fonction',
    'Rôle',
    'Statut',
    'Créées',
    'Reçues',
    'À prendre en charge',
    'En cours',
    'Terminées',
    'En retard',
    'Prise en charge moy.',
    'Traitement net moy.',
    'Dernière action',
  ];
  const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = rows.map((e) =>
    [
      e.user.displayName,
      e.user.jobTitle ?? '',
      ROLE_LABELS[e.user.role],
      e.user.active ? 'Actif' : 'Désactivé',
      e.created,
      e.assigned,
      e.pendingTakeover,
      e.inProgress,
      e.done,
      e.overdueNow,
      e.takeover.count ? formatDurationMs(e.takeover.avgMs) : '',
      e.resolution.count ? formatDurationMs(e.resolution.avgMs) : '',
      e.lastActionAt ?? '',
    ]
      .map(cell)
      .join(';'),
  );
  const blob = new Blob(['﻿' + [header.map(cell).join(';'), ...lines].join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  // Date du jour dans le fuseau du navigateur (AAAA-MM-JJ) : toISOString donnerait la veille après minuit.
  link.download = `employes-${new Intl.DateTimeFormat('en-CA').format(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Charge de travail compacte : à prendre en charge · en cours · terminées. */
function Workload({ e }: { e: EmployeeStats }) {
  const part = (value: number, label: string) => (
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      <Box
        component="span"
        sx={{
          fontWeight: font.semibold,
          color: 'text.primary',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Box>{' '}
      {label}
    </Box>
  );
  return (
    <Box
      component="span"
      sx={(theme) => ({
        display: 'inline-flex',
        flexWrap: 'wrap',
        columnGap: 1,
        rowGap: 0.25,
        fontSize: fontSize.sm,
        color: tokensOf(theme).textSecondary,
      })}
    >
      {part(e.pendingTakeover, 'à prendre')}
      <span aria-hidden="true">·</span>
      {part(e.inProgress, 'en cours')}
      <span aria-hidden="true">·</span>
      {part(e.done, e.done > 1 ? 'terminées' : 'terminée')}
    </Box>
  );
}

const statusBadge = (active: boolean) => (
  <Badge tone={active ? 'success' : 'error'}>{active ? 'Actif' : 'Désactivé'}</Badge>
);
const overdueBadge = (n: number) => (n > 0 ? <Badge tone="error">{n} en retard</Badge> : null);

/**
 * Onglet « Employés » du tableau de bord : liste épurée (employé, rôle, charge, alertes, statut),
 * recherche et filtres, pagination, sélection avec actions groupées ; indicateurs secondaires
 * dans un panneau latéral ; actions du compte (création, modification, photo, désactivation) avec
 * les fenêtres et l'API existantes de l'administration. Cartes à la place du tableau sur mobile.
 */
export function EmployeesView({ qs }: { qs: string }) {
  const employees = useDashboardEmployees(qs);
  const adminUsers = useAdminUsers();
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  // Une seule présentation à la fois : tableau sur grand écran, cartes sur mobile.
  const desktop = useMediaQuery(useTheme().breakpoints.up('md'), { noSsr: true });

  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [filtersAnchor, setFiltersAnchor] = useState<HTMLElement | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; employee: EmployeeStats } | null>(null);
  const [form, setForm] = useState<{ user: AdminUser | null } | null>(null);
  const [password, setPassword] = useState<{ password: string; displayName: string } | null>(null);
  const [photoFor, setPhotoFor] = useState<Person | null>(null);
  const [deactivate, setDeactivate] = useState<Person[] | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (employees.isPending)
    return <DashboardSkeleton label="Chargement des employés" shape="table" />;
  if (employees.error) {
    return (
      <ErrorState
        message={loadErrorMessage(employees.error, 'l’activité des employés')}
        actionLabel="Réessayer"
        onAction={() => void employees.refetch()}
      />
    );
  }

  const all = employees.data.items;
  const filtered = all.filter((e) => matches(e, query, role, status));
  const lastPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1);
  const currentPage = Math.min(page, lastPage);
  const rows = filtered.slice(currentPage * rowsPerPage, currentPage * rowsPerPage + rowsPerPage);
  const detail = all.find((e) => e.user.id === detailId) ?? null;
  const accountOf = (id: string) => adminUsers.data?.find((u) => u.id === id);
  const filterCount = [role, status].filter(Boolean).length;
  const selectedRows = all.filter((e) => selected.has(e.user.id));
  const pageIds = rows.map((e) => e.user.id);
  const pageSelected = pageIds.filter((id) => selected.has(id)).length;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
      queryClient.invalidateQueries({ queryKey: adminKeys.users }),
    ]);
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      const all = pageIds.every((id) => next.has(id));
      pageIds.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });

  /** Activation ou désactivation, compte par compte (même route que la page « Comptes »). */
  async function setActive(people: Person[], active: boolean): Promise<void> {
    setPending(true);
    setActionError(null);
    const failed: string[] = [];
    for (const person of people) {
      try {
        await apiFetch(`/api/admin/users/${person.id}`, { method: 'PATCH', body: { active } });
      } catch (error) {
        failed.push(
          error instanceof ApiError
            ? `${person.displayName} : ${error.message}`
            : person.displayName,
        );
      }
    }
    await refresh();
    setPending(false);
    if (failed.length > 0) {
      setActionError(`Certains comptes n’ont pas été modifiés. ${failed.join(' ')}`);
      return;
    }
    setDeactivate(null);
    setSelected(new Set());
    const done =
      people.length === 1 ? `Compte de ${people[0].displayName}` : `${people.length} comptes`;
    toast.success(
      active
        ? `${done} réactivé${people.length > 1 ? 's' : ''}.`
        : `${done} désactivé${people.length > 1 ? 's' : ''}.`,
    );
  }

  const openMenu = (event: MouseEvent<HTMLElement>, employee: EmployeeStats) => {
    event.stopPropagation();
    setMenu({ anchor: event.currentTarget, employee });
  };

  const actionsButton = (e: EmployeeStats) => (
    <IconButton
      aria-label={`Actions pour ${e.user.displayName}`}
      aria-haspopup="menu"
      onClick={(event) => openMenu(event, e)}
      size="small"
    >
      <EllipsisVertical size={icon.md} aria-hidden="true" />
    </IconButton>
  );

  /**
   * Nom cliquable : ouvre le détail (le clic sur la ligne fait de même, à la souris). Nom accessible
   * en aria-label : un texte masqué à côté du nom serait lu « Reprographie , voir le détail ».
   */
  const nameButton = (e: EmployeeStats) => (
    <ButtonBase
      aria-label={`${e.user.displayName}, voir le détail`}
      onClick={(event) => {
        event.stopPropagation();
        setDetailId(e.user.id);
      }}
      sx={(theme) => ({
        display: 'block',
        textAlign: 'left',
        font: 'inherit',
        fontWeight: font.semibold,
        color: tokensOf(theme).text,
        borderRadius: '4px',
        overflowWrap: 'anywhere',
        '&:hover': { textDecoration: 'underline' },
        '&.Mui-focusVisible': { outline: `2px solid ${tokensOf(theme).focus}`, outlineOffset: 2 },
      })}
    >
      {e.user.displayName}
    </ButtonBase>
  );

  const clearFilters = () => {
    setQuery('');
    setRole('');
    setStatus('');
    setPage(0);
  };

  return (
    <Paper
      component="section"
      aria-labelledby="tdb-employes-titre"
      elevation={0}
      sx={(theme) => ({
        borderRadius: '16px',
        border: `1px solid ${tokensOf(theme).border}`,
        boxShadow: '0 1px 2px rgba(35, 42, 89, 0.04), 0 12px 32px rgba(35, 42, 89, 0.06)',
        overflow: 'hidden',
      })}
    >
      {/* En-tête : titre et bouton principal. */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          px: { xs: 2, sm: 3 },
          pt: { xs: 2, sm: 2.5 },
        }}
      >
        <Box>
          <Typography id="tdb-employes-titre" component="h2" variant="h6">
            Employés
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {all.length} compte{all.length > 1 ? 's' : ''} · indicateurs de la période choisie
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Plus size={icon.sm} aria-hidden="true" />}
          onClick={() => setForm({ user: null })}
          sx={(theme) => ({
            bgcolor: tokensOf(theme).text,
            color: tokensOf(theme).surface,
            '&:hover': { bgcolor: tokensOf(theme).textSecondary },
          })}
        >
          Nouvel employé
        </Button>
      </Box>

      {/* Barre d'outils : recherche, filtres ; ou actions groupées si des lignes sont cochées. */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1.5,
          px: { xs: 2, sm: 3 },
          py: 2,
        }}
      >
        {selected.size > 0 ? (
          <Box
            role="region"
            aria-label="Actions sur la sélection"
            sx={(theme) => ({
              flex: 1,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.75,
              borderRadius: '10px',
              bgcolor: tokensOf(theme).accent.soft,
            })}
          >
            <Typography
              sx={(theme) => ({
                fontWeight: font.medium,
                color: tokensOf(theme).accent.text,
                mr: 'auto',
              })}
            >
              {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
            </Typography>
            <Button
              size="small"
              color="error"
              startIcon={<UserX size={icon.sm} aria-hidden="true" />}
              disabled={selectedRows.every((e) => !e.user.active || e.user.id === me.data?.id)}
              onClick={() =>
                setDeactivate(
                  selectedRows
                    .filter((e) => e.user.active && e.user.id !== me.data?.id)
                    .map((e) => e.user),
                )
              }
            >
              Désactiver
            </Button>
            <Button
              size="small"
              startIcon={<Download size={icon.sm} aria-hidden="true" />}
              onClick={() => downloadCsv(selectedRows)}
            >
              Exporter
            </Button>
            <Button size="small" color="inherit" onClick={() => setSelected(new Set())}>
              Annuler la sélection
            </Button>
          </Box>
        ) : (
          <>
            <TextField
              id="tdb-employes-recherche"
              size="small"
              placeholder="Rechercher un employé…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              sx={{ flex: '1 1 240px', maxWidth: { sm: 360 } }}
              slotProps={{
                htmlInput: { 'aria-label': 'Rechercher un employé' },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={icon.sm} aria-hidden="true" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              variant="outlined"
              sx={{ ml: 'auto' }}
              aria-label={
                filterCount > 0 ? `Filtres des employés (${filterCount})` : 'Filtres des employés'
              }
              aria-haspopup="dialog"
              aria-expanded={Boolean(filtersAnchor)}
              startIcon={<SlidersHorizontal size={icon.sm} aria-hidden="true" />}
              onClick={(e) => setFiltersAnchor(e.currentTarget)}
            >
              {filterCount > 0 ? `Filtres (${filterCount})` : 'Filtres'}
            </Button>
          </>
        )}
      </Box>
      <Popover
        open={Boolean(filtersAnchor)}
        anchorEl={filtersAnchor}
        onClose={() => setFiltersAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': 'Filtres des employés',
            sx: { p: 2, display: 'grid', gap: 2, width: 260 },
          },
        }}
      >
        <TextField
          select
          size="small"
          id="tdb-employes-role"
          label="Rôle"
          value={role}
          onChange={(e) => (setRole(e.target.value as Role | ''), setPage(0))}
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value="">Tous</MenuItem>
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <MenuItem key={r} value={r}>
              {ROLE_LABELS[r]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          id="tdb-employes-statut"
          label="Statut"
          value={status}
          onChange={(e) => (setStatus(e.target.value as StatusFilter), setPage(0))}
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value="">Tous</MenuItem>
          <MenuItem value="active">Actif</MenuItem>
          <MenuItem value="inactive">Désactivé</MenuItem>
        </TextField>
        <Button
          size="small"
          disabled={filterCount === 0}
          onClick={() => (setRole(''), setStatus(''), setPage(0))}
        >
          Réinitialiser les filtres
        </Button>
      </Popover>

      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Aucun employé trouvé"
          description={
            all.length === 0
              ? 'Aucun compte actif et aucune demande sur cette période.'
              : 'Aucun employé ne correspond à cette recherche ou à ces filtres.'
          }
          action={
            all.length > 0 ? (
              <Button variant="outlined" onClick={clearFilters}>
                Effacer la recherche et les filtres
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Grand écran : tableau à 5 colonnes, plus sélection et menu. */}
          {desktop ? (
            <TableContainer>
              <Table
                aria-label="Employés"
                sx={(theme) => {
                  const t = tokensOf(theme);
                  return {
                    '& th': {
                      bgcolor: t.surfaceMuted,
                      color: t.textSecondary,
                      fontWeight: font.medium,
                      fontSize: fontSize.xs,
                      borderBottom: `1px solid ${t.border}`,
                      py: 1,
                    },
                    '& td': { borderBottom: `1px solid ${t.border}`, py: 1.5 },
                    '& tbody tr': { cursor: 'pointer' },
                    '& tbody tr:hover td': { bgcolor: t.surfaceMuted },
                    '& th:first-of-type, & td:first-of-type': { pl: 2 },
                  };
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={pageIds.length > 0 && pageSelected === pageIds.length}
                        indeterminate={pageSelected > 0 && pageSelected < pageIds.length}
                        onChange={togglePage}
                        slotProps={{
                          input: { 'aria-label': 'Sélectionner les employés de la page' },
                        }}
                      />
                    </TableCell>
                    <TableCell>Employé</TableCell>
                    <TableCell>Fonction / Rôle</TableCell>
                    <TableCell>Charge de travail</TableCell>
                    <TableCell>Alertes</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell align="right">
                      <Box component="span" sx={visuallyHidden}>
                        Actions
                      </Box>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((e) => (
                    <TableRow
                      key={e.user.id}
                      hover
                      selected={selected.has(e.user.id)}
                      onClick={() => setDetailId(e.user.id)}
                    >
                      <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          size="small"
                          checked={selected.has(e.user.id)}
                          onChange={() => toggle(e.user.id)}
                          slotProps={{
                            input: { 'aria-label': `Sélectionner ${e.user.displayName}` },
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 200 }}
                        >
                          <UserAvatar
                            user={{ id: e.user.id, displayName: e.user.displayName }}
                            size="lg"
                          />
                          <Box sx={{ minWidth: 0 }}>
                            {nameButton(e)}
                            {e.user.jobTitle && (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ overflowWrap: 'anywhere' }}
                              >
                                {e.user.jobTitle}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {ROLE_LABELS[e.user.role]}
                      </TableCell>
                      <TableCell>
                        <Workload e={e} />
                      </TableCell>
                      <TableCell>{overdueBadge(e.overdueNow)}</TableCell>
                      <TableCell>{statusBadge(e.user.active)}</TableCell>
                      <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                        {actionsButton(e)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            /* Mobile : une carte par employé (avatar, nom, statut, retard). */
            <Box
              component="ul"
              aria-label="Employés"
              sx={(theme) => ({
                display: 'grid',
                listStyle: 'none',
                m: 0,
                p: 0,
                borderTop: `1px solid ${tokensOf(theme).border}`,
              })}
            >
              {rows.map((e) => (
                <Box
                  component="li"
                  key={e.user.id}
                  onClick={() => setDetailId(e.user.id)}
                  sx={(theme) => ({
                    display: 'grid',
                    gridTemplateColumns: 'auto auto minmax(0, 1fr) auto',
                    alignItems: 'center',
                    columnGap: 1.25,
                    px: 1,
                    py: 1.5,
                    borderBottom: `1px solid ${tokensOf(theme).border}`,
                    cursor: 'pointer',
                  })}
                >
                  <Box onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      size="small"
                      checked={selected.has(e.user.id)}
                      onChange={() => toggle(e.user.id)}
                      slotProps={{ input: { 'aria-label': `Sélectionner ${e.user.displayName}` } }}
                    />
                  </Box>
                  <UserAvatar user={{ id: e.user.id, displayName: e.user.displayName }} size="lg" />
                  <Box sx={{ minWidth: 0 }}>
                    {nameButton(e)}
                    <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {statusBadge(e.user.active)}
                      {overdueBadge(e.overdueNow)}
                    </Box>
                  </Box>
                  <Box onClick={(event) => event.stopPropagation()}>{actionsButton(e)}</Box>
                </Box>
              ))}
            </Box>
          )}

          <TablePagination
            component="div"
            count={filtered.length}
            page={currentPage}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={ROWS_PER_PAGE}
            onPageChange={(_e, next) => setPage(next)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setPage(0);
            }}
            labelRowsPerPage="Lignes par page :"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} sur ${count}`}
            getItemAriaLabel={(type) =>
              type === 'next'
                ? 'Page suivante'
                : type === 'previous'
                  ? 'Page précédente'
                  : type === 'first'
                    ? 'Première page'
                    : 'Dernière page'
            }
          />
        </>
      )}

      <Menu
        anchorEl={menu?.anchor}
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {menu && [
          <MenuItem
            key="detail"
            onClick={() => (setDetailId(menu.employee.user.id), setMenu(null))}
          >
            <ListItemIcon>
              <Eye size={icon.sm} aria-hidden="true" />
            </ListItemIcon>
            Voir le détail
          </MenuItem>,
          <MenuItem
            key="edit"
            disabled={!accountOf(menu.employee.user.id)}
            onClick={() => (setForm({ user: accountOf(menu.employee.user.id)! }), setMenu(null))}
          >
            <ListItemIcon>
              <Pencil size={icon.sm} aria-hidden="true" />
            </ListItemIcon>
            Modifier
          </MenuItem>,
          <MenuItem key="photo" onClick={() => (setPhotoFor(menu.employee.user), setMenu(null))}>
            <ListItemIcon>
              <Camera size={icon.sm} aria-hidden="true" />
            </ListItemIcon>
            Changer la photo
          </MenuItem>,
          menu.employee.user.id !== me.data?.id &&
            (menu.employee.user.active ? (
              <MenuItem
                key="deactivate"
                onClick={() => (setDeactivate([menu.employee.user]), setMenu(null))}
                sx={(theme) => ({ color: tokensOf(theme).error.text })}
              >
                <ListItemIcon sx={{ color: 'inherit' }}>
                  <UserX size={icon.sm} aria-hidden="true" />
                </ListItemIcon>
                Désactiver
              </MenuItem>
            ) : (
              <MenuItem
                key="reactivate"
                onClick={() => (void setActive([menu.employee.user], true), setMenu(null))}
              >
                <ListItemIcon>
                  <UserCheck size={icon.sm} aria-hidden="true" />
                </ListItemIcon>
                Réactiver
              </MenuItem>
            )),
        ]}
      </Menu>

      <EmployeeDrawer
        employee={detail}
        onClose={() => setDetailId(null)}
        onEdit={
          detail && accountOf(detail.user.id)
            ? () => setForm({ user: accountOf(detail.user.id)! })
            : undefined
        }
        onChangePhoto={() => detail && setPhotoFor(detail.user)}
      />

      <UserFormDialog
        open={form !== null}
        user={form?.user}
        isSelf={form?.user?.id === me.data?.id}
        onClose={() => setForm(null)}
        onCreated={({ user, temporaryPassword }) => {
          setForm(null);
          setPassword({ password: temporaryPassword, displayName: user.displayName });
          void refresh();
        }}
        onSaved={(message) => {
          setForm(null);
          toast.success(message);
          void refresh();
        }}
      />
      <TemporaryPasswordDialog value={password} onClose={() => setPassword(null)} />
      {photoFor && (
        <AvatarDialog
          open
          user={{ id: photoFor.id, displayName: photoFor.displayName }}
          onClose={() => setPhotoFor(null)}
        />
      )}
      <ConfirmDialog
        open={deactivate !== null}
        title={
          deactivate && deactivate.length > 1
            ? `Désactiver ${deactivate.length} comptes ?`
            : 'Désactiver ce compte ?'
        }
        confirmLabel={
          deactivate && deactivate.length > 1 ? 'Désactiver les comptes' : 'Désactiver le compte'
        }
        pending={pending}
        error={actionError}
        onConfirm={() => deactivate && void setActive(deactivate, false)}
        onClose={() => {
          setDeactivate(null);
          setActionError(null);
        }}
      >
        {deactivate && deactivate.length > 1
          ? `${deactivate.map((p) => p.displayName).join(', ')} seront déconnectés immédiatement et ne pourront plus se connecter. Leurs demandes et leur historique sont conservés.`
          : `${deactivate?.[0]?.displayName ?? ''} sera déconnecté immédiatement et ne pourra plus se connecter. Ses demandes et son historique sont conservés.`}
      </ConfirmDialog>
    </Paper>
  );
}
