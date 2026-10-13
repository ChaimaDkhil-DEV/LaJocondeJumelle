import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { Plus, School } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useCoverageProfile } from './api';
import { MyGuardTab, OpenCoverageTab, PersonalHistoryTab } from './EmployeeViews';
import { ManagedCoverageTab, TeamTab } from './ManagerViews';

interface TabDef {
  key: string;
  label: string;
  render: () => ReactNode;
}

const EMPLOYEE_TABS: TabDef[] = [
  { key: 'a-prendre', label: 'À prendre', render: () => <OpenCoverageTab /> },
  { key: 'ma-garde', label: 'Ma garde', render: () => <MyGuardTab /> },
  { key: 'historique', label: 'Historique', render: () => <PersonalHistoryTab /> },
];

const MANAGER_TABS: TabDef[] = [
  { key: 'en-cours', label: 'En cours', render: () => <ManagedCoverageTab finished={false} /> },
  { key: 'equipe', label: 'Équipe', render: () => <TeamTab /> },
  { key: 'terminees', label: 'Terminées', render: () => <ManagedCoverageTab finished /> },
];

/**
 * « Gardes » : couverture de classe. Employé d'un groupe de remplacement : À prendre, Ma garde,
 * Historique. Responsable ou super administrateur : demandes en cours, équipe, terminées.
 */
export function CoveragePage() {
  const profile = useCoverageProfile();
  const [params, setParams] = useSearchParams();

  if (profile.isPending) return <LoadingState label="Chargement des gardes" variant="detail" />;
  if (profile.error) return <ErrorState message="Impossible de charger les gardes." actionLabel="Réessayer" onAction={() => void profile.refetch()} />;

  const { canManage, inGroup } = profile.data;
  const tabs = [...(canManage ? MANAGER_TABS : []), ...(inGroup && !canManage ? EMPLOYEE_TABS : [])];
  const tab = tabs.find((t) => t.key === params.get('onglet')) ?? tabs[0];

  return (
    <>
      <PageHeader
        title="Gardes de classe"
        description={
          canManage
            ? 'Diffusez un besoin de surveillance quand une enseignante est absente ou en retard, et suivez chaque garde en direct.'
            : 'Les gardes à prendre de votre groupe, votre garde en cours et votre historique.'
        }
        actions={
          canManage && (
            <Button component={RouterLink} to="/gardes/nouvelle" variant="contained" startIcon={<Plus aria-hidden="true" />}>
              Nouvelle demande de couverture
            </Button>
          )
        }
      />
      {!tab ? (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
          <EmptyState
            icon={School}
            title="Vous ne faites partie d’aucun groupe de remplacement"
            description="Le super administrateur peut vous ajouter à un groupe (par exemple Surveillants/Remplaçants)."
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
