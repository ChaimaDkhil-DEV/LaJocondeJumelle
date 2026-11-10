import type { Me } from '../../api/types';

/**
 * Accueil de l'enseignant (016) : employé membre du groupe Enseignants. Un admin ou le super
 * administrateur, même enseignant, garde son accueil (« Mes demandes » avec validation, tableau de bord).
 */
export function hasTeacherHome(me: Me | undefined): boolean {
  return me?.role === 'EMPLOYEE' && Boolean(me.isTeacher);
}
