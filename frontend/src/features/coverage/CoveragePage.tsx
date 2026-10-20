import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { School } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useCoverageProfile } from './api';
import { MyGuardTab, PersonalHistoryTab } from './EmployeeViews';
import { ManagedCoverageTab, TeamTab } from './ManagerViews';

interface TabDef {
  key: string;
  label: string;
  render: () => ReactNode;
}

const SUPERVISOR_TABS: TabDef[] = [
  { key: 'mes-affectations', label: 'Mes affectations', render: () => <MyGuardTab /> },
  { key: 'historique', label: 'Historique', render: () => <PersonalHistoryTab /> },
];

const ADMIN_TABS: TabDef[] = [
  { key: 'en-cours', label: 'En cours', render: () => <ManagedCoverageTab finished={false} /> },
  { key: 'equipe', label: 'Équipe', render: () => <TeamTab /> },
  { key: 'terminees', label: 'Terminées', render: () => <ManagedCoverageTab finished /> },
];

/**
 * « Gardes » : affectations des surveillants (004). Admin ou super administrateur : affectations en
 * cours (en attente d'abord), équipe, terminées. Surveillant : ses affectations et renforts, historique.
 * La diffusion à un groupe (« À prendre ») n'existe plus : seul l'admin assigne (FR-011a).
 */
export function CoveragePage() {
  const profile = useCoverageProfile();
  const [params, setParams] = useSearchParams();

  if (profile.isPending) return <LoadingState label="Chargement des affectations" variant="detail" />;
  if (profile.error) {
    return <ErrorState message="Impossible de charger les affectations." actionLabel="Réessayer" onAction={() => void profile.refetch()} />;
  }

  const { canManage, inGroup } = profile.data;
  const tabs = [...(canManage ? ADMIN_TABS : []), ...(inGroup && !canManage ? SUPERVISOR_TABS : [])];
  const tab = tabs.find((t) => t.key === params.get('onglet')) ?? tabs[0];

  return (
    <>
      <PageHeader
        title="Gardes de classe"
        description={
          canManage
            ? 'Assignez un surveillant aux retards et absences signalés, et suivez chaque affectation en direct.'
            : 'Vos affectations en cours, vos renforts et votre historique.'
        }
      />
      {!tab ? (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
          <EmptyState
            icon={School}
            title="Aucune affectation pour vous"
            description="Le super administrateur peut vous ajouter au groupe Surveillants ou Enseignants."
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
            aria-label="Gardes"
            variant="scrollable"
            scrollButtons={false}
            sx={{ mb: 2 }}
          >
            {tabs.map((t) => (
              <Tab key={t.key} value={t.key} label={t.label} id={`onglet-${t.key}`} aria-controls="panneau-gardes" />
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
