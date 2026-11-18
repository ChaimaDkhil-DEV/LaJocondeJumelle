import type { PrismaClient } from '@prisma/client';
import { localDate } from '../../src/common/school-time';
import { seriesDates, sessionRange } from '../../src/timetable/domain/series';
import { stableId } from './random';
import { CLASSES, STAFF } from './school-data';

/**
 * Emplois du temps de démonstration (020). Volontairement PARTIELS : seuls quelques enseignants ont un emploi du
 * temps, pour montrer aussi des enseignants sans séance (ils n'apparaissent pas dans « Attendus »). Les autres
 * se saisissent dans l'application.
 *
 * - les 10 premiers titulaires (classes du rez-de-chaussée et du 1er étage) : leur classe, du lundi au vendredi,
 *   08:00–10:00 (mathématiques) et 10:15–12:00 (français) ;
 * - la professeure d'anglais : 14:00–15:00, du lundi au jeudi, dans quatre de ces classes.
 *
 * Séries de la date du jour (fuseau de l'école) au 30 juin 2027 ; aucune séance passée. Identifiants stables et
 * insertion « si absent » : relancer le seed n'ajoute rien, et une séance qui chevaucherait une séance saisie
 * entre-temps dans l'application est simplement ignorée (contraintes d'exclusion de la migration 0031).
 */

export const DEMO_TIMETABLE_END = '2027-06-30';
/** Nombre de titulaires qui reçoivent un emploi du temps de démonstration. */
export const DEMO_TIMETABLE_TEACHERS = 10;
const ENGLISH_TEACHER = 'emna.sellami';

export interface DemoSeries {
  key: string;
  username: string;
  classKey: string;
  weekday: number;
  startTime: string;
  endTime: string;
  subject: string;
}

/** Séries de démonstration (pur, testé). */
export function demoTimetableSeries(): DemoSeries[] {
  const titulars = STAFF.filter((s) => s.kind === 'teacher' && s.classKey).slice(0, DEMO_TIMETABLE_TEACHERS);
  const own = titulars.flatMap((t) =>
    [1, 2, 3, 4, 5].flatMap((weekday) => [
      { username: t.username, classKey: t.classKey!, weekday, startTime: '08:00', endTime: '10:00', subject: 'Mathématiques' },
      { username: t.username, classKey: t.classKey!, weekday, startTime: '10:15', endTime: '12:00', subject: 'Français' },
    ]),
  );
  const english = [1, 2, 3, 4].map((weekday, i) => ({
    username: ENGLISH_TEACHER,
    classKey: titulars[i].classKey!,
    weekday,
    startTime: '14:00',
    endTime: '15:00',
    subject: 'Anglais',
  }));
  return [...own, ...english].map((s) => ({ ...s, key: `${s.username}:${s.weekday}:${s.startTime}` }));
}

export interface DemoTimetableReport {
  teachers: number;
  series: number;
  sessions: number;
}

export async function seedDemoTimetable(
  prisma: PrismaClient,
  options: { now: Date; timeZone: string; authorId: string },
): Promise<DemoTimetableReport> {
  const today = localDate(options.now, options.timeZone);
  const definitions = demoTimetableSeries();
  const [users, classes] = await Promise.all([
    prisma.user.findMany({ where: { username: { in: [...new Set(definitions.map((d) => d.username))] }, active: true }, select: { id: true, username: true } }),
    prisma.schoolClass.findMany({ where: { name: { in: CLASSES.map((c) => c.name) } }, select: { id: true, name: true } }),
  ]);
  const userIdOf = new Map(users.map((u) => [u.username, u.id]));
  const classIdOf = new Map(CLASSES.flatMap((c) => {
    const row = classes.find((r) => r.name === c.name);
    return row ? [[c.key, row.id] as const] : [];
  }));

  const usable = definitions.filter((d) => userIdOf.has(d.username) && classIdOf.has(d.classKey));
  const series = usable.map((d) => ({
    id: stableId(`timetable-series:${d.key}`),
    teacherId: userIdOf.get(d.username)!,
    classId: classIdOf.get(d.classKey)!,
    weekday: d.weekday,
    startTime: d.startTime,
    endTime: d.endTime,
    subject: d.subject,
    startDate: new Date(`${today}T00:00:00.000Z`),
    endDate: new Date(`${DEMO_TIMETABLE_END}T00:00:00.000Z`),
    createdById: options.authorId,
  }));
  if (today > DEMO_TIMETABLE_END) return { teachers: 0, series: 0, sessions: 0 };

  const createdSeries = (await prisma.timetableSeries.createMany({ data: series, skipDuplicates: true })).count;
  const sessions = usable.flatMap((d, i) =>
    seriesDates({ weekday: d.weekday, startDate: today, endDate: DEMO_TIMETABLE_END }, today).map((date) => ({
      id: stableId(`timetable-session:${d.key}:${date}`),
      seriesId: series[i].id,
      teacherId: series[i].teacherId,
      classId: series[i].classId,
      localDate: new Date(`${date}T00:00:00.000Z`),
      ...sessionRange(date, d.startTime, d.endTime, options.timeZone),
      subject: d.subject,
      createdById: options.authorId,
    })),
  );
  let createdSessions = 0;
  for (let i = 0; i < sessions.length; i += 500) {
    // ON CONFLICT DO NOTHING : ignore aussi une séance qui chevaucherait une séance saisie dans l'application.
    createdSessions += (await prisma.teachingSession.createMany({ data: sessions.slice(i, i + 500), skipDuplicates: true })).count;
  }
  return { teachers: new Set(usable.map((d) => d.username)).size, series: createdSeries, sessions: createdSessions };
}
