/*
 * Service worker des notifications push (spec 014, contracts/push-payload.md).
 *
 * - Compose le texte à partir du contenu reçu ({ v, id, type, place, url }) : le serveur n'envoie
 *   aucun texte rédigé. Langue de l'appareil transmise à l'enregistrement : /sw.js?lang=fr|en.
 * - Pas de notification système quand l'application est visible et au premier plan (D10), sauf sur
 *   les appareils Apple (WebKit exige l'affichage de chaque push, sinon l'abonnement peut être retiré).
 * - Le clic n'ouvre que l'application, sur la ressource, avec ?notification=<id> : la page la marque
 *   lue après son chargement réussi (FR-008).
 * - Aucun gestionnaire `fetch`, aucun cache (NFR-003). Libellés identiques à NOTIFICATION_LABELS et à
 *   leur traduction anglaise (vérifié par frontend/tests/push/sw.test.ts).
 */
'use strict';

const LANG = new URL(self.location.href).searchParams.get('lang') === 'en' ? 'en' : 'fr';
const ICON = '/icons/icon-192.png';

const LABELS = {
  fr: {
    URGENT: 'Demande urgente',
    ASSIGNED: 'Demande affectée',
    COVERAGE_REQUESTED: 'Retard ou absence signalé',
    COVERAGE_EMPTY_CLASS: 'Classe vide signalée',
    COVERAGE_LIFTED: 'Affectation levée',
    COVERAGE_UPDATED: 'Affectation modifiée',
    COVERAGE_EXTENDED: 'Garde prolongée',
    COVERAGE_RELIEF_REQUESTED: 'Relève demandée',
    COVERAGE_LATE: 'Garde en retard',
    COVERAGE_DOUBLE_ASSIGNMENT: 'Surveillant sur deux affectations',
    COVERAGE_SUPPORT_REMINDER: 'Renfort à décider',
    COVERAGE_TAKEOVER_EXPIRED: 'Demande en attente d’assignation',
    COVERAGE_ESCALATED: 'Alerte non traitée',
    COVERAGE_UNFILLED: 'Garde non pourvue',
    COVERAGE_TEACHER_ARRIVED: 'Enseignant arrivé',
    COVERAGE_ATTENDANCE_ANOMALY: 'Absence annoncée mais enseignant présent',
  },
  en: {
    URGENT: 'Urgent request',
    ASSIGNED: 'Request assigned',
    COVERAGE_REQUESTED: 'Delay or absence reported',
    COVERAGE_EMPTY_CLASS: 'Empty class reported',
    COVERAGE_LIFTED: 'Assignment lifted',
    COVERAGE_UPDATED: 'Assignment changed',
    COVERAGE_EXTENDED: 'Coverage extended',
    COVERAGE_RELIEF_REQUESTED: 'Handover requested',
    COVERAGE_LATE: 'Coverage overdue',
    COVERAGE_DOUBLE_ASSIGNMENT: 'Supervisor on two assignments',
    COVERAGE_SUPPORT_REMINDER: 'Support to decide',
    COVERAGE_TAKEOVER_EXPIRED: 'Request awaiting assignment',
    COVERAGE_ESCALATED: 'Unhandled alert',
    COVERAGE_UNFILLED: 'Coverage unfilled',
    COVERAGE_TEACHER_ARRIVED: 'Teacher arrived',
    COVERAGE_ATTENDANCE_ANOMALY: 'Absence announced but teacher present',
  },
};
const GENERIC = { fr: 'Nouvelle notification', en: 'New notification' };

/** Chemin relatif de l'application (jamais une autre origine ni un schéma). */
function isAppPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

/** Appareils Apple (iPhone, iPad, Safari) : chaque push doit afficher une notification. */
function mustAlwaysShow() {
  const ua = self.navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua);
}

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (!data || data.v !== 1 || typeof data.id !== 'string' || typeof data.place !== 'string') return null;
    if (!Object.prototype.hasOwnProperty.call(LABELS.fr, data.type) || !isAppPath(data.url)) return null;
    return data;
  } catch {
    return null;
  }
}

async function appInForeground() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return windows.some((client) => client.visibilityState === 'visible' && client.focused);
}

async function onPush(event) {
  const data = readPayload(event);
  const always = mustAlwaysShow();
  if (!data) {
    if (always) await self.registration.showNotification(GENERIC[LANG], { icon: ICON, badge: ICON });
    return;
  }
  if (!always && (await appInForeground())) return;
  await self.registration.showNotification(LABELS[LANG][data.type], {
    body: data.place,
    tag: data.id,
    icon: ICON,
    badge: ICON,
    data: { url: data.url, id: data.id },
  });
}

async function onClick(data) {
  const target = new URL(data && isAppPath(data.url) ? data.url : '/', self.location.origin);
  if (data && typeof data.id === 'string') target.searchParams.set('notification', data.id);
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (existing) {
    try {
      await existing.navigate(target.href);
      await existing.focus();
      return;
    } catch {
      // Fenêtre non contrôlée par ce service worker : on en ouvre une nouvelle.
    }
  }
  await self.clients.openWindow(target.href);
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  event.waitUntil(onPush(event));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(onClick(event.notification.data));
});
