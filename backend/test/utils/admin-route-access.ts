import { ROUTE_UUID as UUID } from './routes';

/**
 * Routes /admin/* ouvertes à l'admin (011, contracts/http-api.md) : données de référence et liste des employés.
 * Toute autre route /admin/*, y compris une route ajoutée plus tard, reste réservée au super administrateur.
 */
export const ADMIN_ALLOWED: readonly string[] = [
  'GET /api/admin/floors',
  'POST /api/admin/floors',
  `PATCH /api/admin/floors/${UUID}`,
  'GET /api/admin/levels',
  'POST /api/admin/levels',
  `PATCH /api/admin/levels/${UUID}`,
  'GET /api/admin/students',
  'POST /api/admin/students',
  `PATCH /api/admin/students/${UUID}`,
  'POST /api/admin/students/import',
  // Historique des classes et situation d'un élève (021) : administration seulement.
  `GET /api/admin/students/${UUID}/class-history`,
  `GET /api/admin/students/${UUID}/situation`,
  `GET /api/admin/students/${UUID}/audit`,
  'GET /api/admin/coverage/classes',
  'POST /api/admin/coverage/classes',
  `PATCH /api/admin/coverage/classes/${UUID}`,
  `GET /api/admin/coverage/classes/${UUID}/qr`,
  `POST /api/admin/coverage/classes/${UUID}/qr/revoke`,
  'GET /api/admin/employees',
  // Communication avec les parents (015) : représentants et classes des enseignants.
  'GET /api/admin/guardians',
  'POST /api/admin/guardians',
  `PATCH /api/admin/guardians/${UUID}`,
  `POST /api/admin/guardians/${UUID}/account`,
  'GET /api/admin/teacher-classes',
  `PUT /api/admin/teacher-classes/${UUID}`,
  // Communications (017) : boîte commune de l'administration ; « À valider » exige en plus la permission
  // PARENT_COMMUNICATION_VALIDATE, accordée par défaut au rôle ADMIN et retirable dans les réglages.
  'GET /api/admin/communications/inbox',
  'GET /api/admin/communications/conversations',
  'POST /api/admin/communications/conversations',
  `GET /api/admin/communications/conversations/${UUID}`,
  `POST /api/admin/communications/conversations/${UUID}/messages`,
  `POST /api/admin/communications/conversations/${UUID}/close`,
  `POST /api/admin/communications/conversations/${UUID}/reopen`,
  `PUT /api/admin/communications/conversations/${UUID}/responsible`,
  'GET /api/admin/communications/recipients',
  'GET /api/admin/communications/send-mode',
  'GET /api/admin/communications/to-validate',
  `GET /api/admin/communications/messages/${UUID}`,
  `POST /api/admin/communications/messages/${UUID}/decision`,
  `PATCH /api/admin/communications/messages/${UUID}`,
  `POST /api/admin/communications/messages/${UUID}/submit`,
  `POST /api/admin/communications/messages/${UUID}/cancel`,
  // Espace de travail des administrateurs (018) : file commune, prise en charge, historique des responsables.
  // Le service limite chaque admin à ses catégories ; le super administrateur consulte sans prendre en charge.
  'GET /api/admin/requests/available',
  'GET /api/admin/requests/mine',
  'GET /api/admin/requests/summary',
  `POST /api/admin/requests/${UUID}/claim`,
  `GET /api/admin/requests/${UUID}/assignments`,
  'GET /api/admin/assignments/mine',
  // Transferts entre administrateurs (018, lot 2) : chaque route ne sert que l'auteur ou le destinataire lu dans la session.
  `GET /api/admin/requests/${UUID}/transfer-candidates`,
  `POST /api/admin/requests/${UUID}/transfers`,
  'GET /api/admin/transfers/received',
  'GET /api/admin/transfers/sent',
  'GET /api/admin/transfers/history',
  `GET /api/admin/transfers/${UUID}`,
  `POST /api/admin/transfers/${UUID}/accept`,
  `POST /api/admin/transfers/${UUID}/reject`,
  `POST /api/admin/transfers/${UUID}/cancel`,
];
