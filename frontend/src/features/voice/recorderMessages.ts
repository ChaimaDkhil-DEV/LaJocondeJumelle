import { t } from '../../i18n';

/** Messages d'erreur du micro, communs à l'enregistreur de formulaire et à la saisie des conversations. */
export const DENIED_MESSAGE = t(
  'L’accès au micro a été refusé. Autorisez le micro pour ce site dans les réglages de votre navigateur, ou écrivez votre demande dans la description écrite.',
);
export const UNSUPPORTED_MESSAGE = t(
  'Votre navigateur ne permet pas d’enregistrer un message vocal. Écrivez votre demande dans la description.',
);
export const ERROR_MESSAGE = t(
  'Impossible d’accéder au micro. Vérifiez qu’il est branché et disponible, ou écrivez votre demande dans la description.',
);
