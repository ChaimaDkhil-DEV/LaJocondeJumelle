import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { BarChart3, CalendarPlus, DoorOpen, School, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useCoverageProfile } from './api';
import { MyGuardTab, PersonalHistoryTab } from './EmployeeViews';
import { ManagedCoverageTab, MergeProposalsTab, TeamTab } from './ManagerViews';
import { MyRequestsTab } from './TeacherViews';
import { t } from '../../i18n';

interface TabDef {
  key: string;
  label: string;
  render: () => ReactNode;
}

/** File de l'admin : demandes en attente d'abord (délais expirés en tête, FR-011e). */
const ADMIN_TABS: TabDef[] = [
  { key: 'en-attente', label: t('En attente'), render: () => <ManagedCoverageTab scope="pending" /> },
  { key: 'en-cours', label: t('En cours'), render: () => <ManagedCoverageTab scope="active" /> },
  { key: 'doublons', label: t('Doublons'), render: () => <MergeProposalsTab /> },
  { key: 'equipe', label: t('Équipe'), render: () => <TeamTab /> },
  { key: 'terminees', label: t('Terminées'), render: () => <ManagedCoverageTab scope="finished" /> },
];

const TEACHER_TABS: TabDef[] = [
  { key: 'mes-signalements', label: t('Mes signalements'), render: () => <MyRequestsTab /> },
];

const SUPERVISOR_TABS: TabDef[] = [
  { key: 'mes-affectations', label: t('Mes affectations'), render: () => <MyGuardTab /> },
  { key: 'historique', label: t('Historique'), render: () => <PersonalHistoryTab /> },
];

/**
 * « Gardes » : affectations des surveillants (004). Admin ou super administrateur : file en attente,
 * affectations en cours, équipe, terminées. Enseignant : ses signalements. Surveillant : ses
 * affectations et renforts, historique. Un même compte cumule les onglets de ses groupes.
 */
export function CoveragePage() {
  const profile = useCoverageProfile();
  const [params, setParams] = useSearchParams();

  if (profile.isPending)
    return <LoadingState label={t('Chargement des affectations')} variant="detail" />;
  if (profile.error) {
    return (
      <ErrorState
        message={t('Impossible de charger les affectations.')}
        actionLabel={t('Réessayer')}
        onAction={() => void profile.refetch()}
      />
    );
  }

  const { canManage, isTeacher, isSupervisor } = profile.data;
  const canDeclare = profile.data.capabilities?.declareEmptyClass ?? isSupervisor;
  const tabs = [
    ...(canManage ? ADMIN_TABS : []),
    ...(isTeacher ? TEACHER_TABS : []),
    ...(isSupervisor && !canManage ? SUPERVISOR_TABS : []),
  ];
  const tab = tabs.find((t) => t.key === params.get('onglet')) ?? tabs[0];

  return (
    <>
      <PageHeader
        title={t('Gardes de classe')}
        description={
          canManage
            ? t('Assignez un surveillant aux retards et absences signalés, et suivez chaque affectation en direct.')
            : isTeacher
              ? t('Signalez à l’avance un retard ou une absence : l’admin assigne un surveillant à votre classe.')
              : t('Vos affectations en cours, vos renforts et votre historique.')
        }
        actions={
          (canManage || isTeacher || canDeclare) && (
            <>
              {canManage && (
                <Button
                  component={RouterLink}
                  to="/gardes/nouvelle"
                  variant="contained"
                  startIcon={<UserPlus aria-hidden="true" />}
                >
                  {t('Nouvelle affectation')}
                </Button>
              )}
              {canManage && (
                <Button
                  component={RouterLink}
                  to="/gardes/statistiques"
                  variant="outlined"
                  startIcon={<BarChart3 aria-hidden="true" />}
                >
                  {t('Statistiques')}
                </Button>
              )}
              {canDeclare && (
                <Button
                  component={RouterLink}
                  to="/gardes/classe-vide"
                  variant={canManage ? 'outlined' : 'contained'}
                  startIcon={<DoorOpen aria-hidden="true" />}
                >
                  {t('Déclarer une classe vide')}
                </Button>
              )}
              {isTeacher && (
                <Button
                  component={RouterLink}
                  to="/gardes/signaler"
                  variant={canManage || canDeclare ? 'outlined' : 'contained'}
                  startIcon={<CalendarPlus aria-hidden="true" />}
                >
                  {t('Signaler un retard ou une absence')}
                </Button>
              )}
            </>
          )
        }
      />
      {!tab ? (
        <Box
          sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}
        >
          <EmptyState
            icon={School}
            title={t('Aucune affectation pour vous')}
            description={t('Le super administrateur peut vous ajouter au groupe Surveillants ou Enseignants.')}
          />
        </Box>
      ) : (
        <>
          <Tabs
            value={tab.key}
            onChange={(_e, key: string) => {
              const next = new URLSearchParams(params);
              next.set('onglet', key);
              setParams(next, { replace: true });
            }}
            aria-label={t('Gardes')}
            variant="scrollable"
            scrollButtons={false}
            sx={{ mb: 2 }}
          >
            {tabs.map((t) => (
              <Tab
                key={t.key}
                value={t.key}
                label={t.label}
                id={`onglet-${t.key}`}
                aria-controls="panneau-gardes"
              />
            ))}
          </Tabs>
          <Box id="panneau-gardes" role="tabpanel" aria-labelledby={`onglet-${tab.key}`}>
            {tab.render()}
          </Box>
        </>
      )}
    </>
  );
}
