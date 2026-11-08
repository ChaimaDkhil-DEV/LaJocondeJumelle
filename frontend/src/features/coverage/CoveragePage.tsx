import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { BarChart3, CalendarPlus, DoorOpen, School } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useCoverageProfile } from './api';
import { AttendanceFollowUpTab } from '../attendance/AttendanceFollowUpTab';
import { MyAttendanceTab } from '../attendance/MyAttendanceTab';
import { MyGuardTab, PersonalHistoryTab } from './EmployeeViews';
import { AssignmentTab } from './AssignmentTab';
import { TrackingTab } from './TrackingTab';
import { MyRequestsTab } from './TeacherViews';
import { resolveLegacyTab } from './surveillanceTabs';
import { t } from '../../i18n';

interface TabDef {
  key: string;
  label: string;
  render: () => ReactNode;
}

/**
 * Administration (012) : voir les situations, assigner un surveillant, suivre les interventions.
 * Clés et anciennes adresses : surveillanceTabs.ts.
 */
const ADMIN_TABS: TabDef[] = [
  { key: 'absences-retards', label: t('Absences et retards'), render: () => <AttendanceFollowUpTab /> },
  { key: 'affectation', label: t('Affectation des surveillants'), render: () => <AssignmentTab /> },
  { key: 'suivi', label: t('Suivi des interventions'), render: () => <TrackingTab /> },
];

const TEACHER_TABS: TabDef[] = [
  { key: 'mes-signalements', label: t('Mes signalements'), render: () => <MyRequestsTab /> },
  { key: 'mes-presences', label: t('Mes présences'), render: () => <MyAttendanceTab /> },
];

const SUPERVISOR_TABS: TabDef[] = [
  { key: 'mes-affectations', label: t('Mes affectations'), render: () => <MyGuardTab /> },
  { key: 'historique', label: t('Historique'), render: () => <PersonalHistoryTab /> },
];

/**
 * « Surveillance » (ex-« Gardes », 012) : affectations des surveillants (004). Admin ou super administrateur :
 * absences et retards, affectation des surveillants, suivi des interventions. Enseignant : ses signalements et
 * ses présences. Surveillant : ses affectations et renforts, historique. Un même compte cumule les onglets de
 * ses groupes. Les anciennes clés d'onglet (favoris, liens) sont traduites puis l'adresse est réécrite.
 */
export function CoveragePage() {
  const profile = useCoverageProfile();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const legacy = resolveLegacyTab(params.get('onglet'));

  useEffect(() => {
    const moved = resolveLegacyTab(params.get('onglet'));
    if (!moved) return;
    const next = new URLSearchParams(params);
    next.set('onglet', moved.onglet);
    if (moved.filtre) next.set('filtre', moved.filtre);
    navigate({ search: `?${next.toString()}`, hash: moved.hash ?? '' }, { replace: true });
  }, [params, navigate]);

  // Lien vers une partie d'un onglet (ex. #doublons) : la faire défiler une fois l'onglet affiché.
  const { hash } = useLocation();
  const ready = !profile.isPending;
  useEffect(() => {
    if (!ready || !hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'start' });
  }, [ready, hash]);

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
    ...(isSupervisor ? SUPERVISOR_TABS : []),
  ];
  // Ancienne clé : le bon onglet s'affiche tout de suite, l'adresse est réécrite juste après.
  const selected = legacy?.onglet ?? params.get('onglet');
  const tab = tabs.find((t) => t.key === selected) ?? tabs[0];

  return (
    <>
      <PageHeader
        title={t('Surveillance')}
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
            aria-label={t('Surveillance')}
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
                aria-controls="panneau-surveillance"
              />
            ))}
          </Tabs>
          <Box id="panneau-surveillance" role="tabpanel" aria-labelledby={`onglet-${tab.key}`}>
            {tab.render()}
          </Box>
        </>
      )}
    </>
  );
}
