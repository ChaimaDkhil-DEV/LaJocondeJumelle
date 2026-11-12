import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { t } from '../../i18n';
import { canUseAdministrationSpace } from '../admin/access';
import { useCurrentUser } from '../auth/useCurrentUser';
import { AdminCommunications } from './AdminCommunications';
import { TeacherCommunications } from './TeacherCommunications';

/**
 * « Communications » (017) : une seule entrée, une seule page, pour les enseignants et pour
 * l'administration. L'enseignant écrit à l'administration ; l'administration à un enseignant ou à un
 * parent. Les anciennes adresses (`/communications/boite`, `/nouveau`…) redirigent ici
 * (`LegacyRedirects`). Le serveur vérifie chaque accès.
 */
export function CommunicationsPage() {
  const me = useCurrentUser();
  if (me.isPending) return <LoadingState />;
  if (canUseAdministrationSpace(me.data)) return <AdminCommunications />;
  return (
    <>
      <PageHeader title={t('Communications')} />
      <TeacherCommunications />
    </>
  );
}
