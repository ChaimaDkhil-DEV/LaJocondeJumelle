import { useSearchParams } from 'react-router';
import { LoadingState } from '../../components/LoadingState';
import { useCoverageProfile } from '../coverage/api';
import { PresencePage } from '../coverage/PresencePage';
import { t } from '../../i18n';
import { ArrivalPage } from './ArrivalPage';

/**
 * Lien encodé dans le QR code de la classe : un seul QR par classe, deux usages selon le profil de la
 * session. Un enseignant enregistre son arrivée ; les autres (surveillants, admins) gardent la page de
 * présence en garde. Un compte à la fois enseignant et surveillant arrive sur la page de l'enseignant,
 * avec un lien vers la page de garde (`as=surveillant`). Le serveur revérifie le rôle à chaque action.
 */
export function QrEntryPage() {
  const [params] = useSearchParams();
  const profile = useCoverageProfile();
  if (profile.isPending) return <LoadingState label={t('Chargement de la classe')} variant="detail" />;
  const asTeacher = Boolean(profile.data?.isTeacher) && params.get('as') !== 'surveillant';
  return asTeacher ? <ArrivalPage /> : <PresencePage />;
}
