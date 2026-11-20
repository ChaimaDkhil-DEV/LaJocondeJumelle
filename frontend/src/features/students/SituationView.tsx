import Box from '@mui/material/Box';
import GlobalStyles from '@mui/material/GlobalStyles';
import Typography from '@mui/material/Typography';
import { CircleAlert, CircleCheck, CircleHelp, CircleSlash, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '../../components/Badge';
import { formatDateTime } from '../../components/format';
import { font, fontSize, type Tone } from '../../design/tokens';
import { t } from '../../i18n';
import type { Arrival, Availability, Person, Section, Situation, SituationChange } from './studentSituationApi';

/** Libellé écrit de chaque disponibilité : le sens ne repose jamais sur la seule couleur. */
const AVAILABILITY: Record<Availability, { label: string; tone: Tone; icon: LucideIcon }> = {
  KNOWN: { label: t('Connue'), tone: 'success', icon: CircleCheck },
  PROBABLE: { label: t('Probable'), tone: 'warning', icon: CircleAlert },
  NONE: { label: t('Aucune information enregistrée'), tone: 'neutral', icon: CircleHelp },
  UNAVAILABLE: { label: t('Indisponible'), tone: 'error', icon: CircleSlash },
};

const KIND_LABELS: Record<string, string> = {
  TIMETABLE_CHANGED: t('Emploi du temps modifié'),
  ATTENDANCE_CORRECTED: t('Pointage corrigé'),
  ATTENDANCE_MANUAL: t('Pointage saisi à la main'),
  COVERAGE_MANAGED: t('Remplaçant ou garde modifié'),
  SUBSTITUTE_SET: t('Remplaçant désigné'),
};

const name = (person: Person | null) => (person ? (person.anonymized ? t('Compte anonymisé') : person.displayName) : t('Inconnu'));

function SectionBlock<T>({ title, section, children }: { title: string; section: Section<T>; children?: ReactNode }) {
  const meta = AVAILABILITY[section.availability];
  return (
    <Box component="section" aria-label={title} sx={{ display: 'grid', gap: 0.75, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5, breakInside: 'avoid' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Typography component="h3" sx={{ fontSize: fontSize.md, fontWeight: font.semibold }}>
          {title}
        </Typography>
        <Badge tone={meta.tone} icon={meta.icon}>
          {meta.label}
        </Badge>
      </Box>
      {section.warning && <Typography variant="body2" sx={{ fontWeight: font.medium }}>{section.warning}</Typography>}
      {section.reasonUnavailable && <Typography variant="body2">{section.reasonUnavailable}</Typography>}
      {children}
    </Box>
  );
}

const Line = ({ children }: { children: ReactNode }) => <Typography variant="body2">{children}</Typography>;
const Muted = ({ children }: { children: ReactNode }) => (
  <Typography variant="body2" color="text.secondary">
    {children}
  </Typography>
);

function ArrivalLine({ arrival }: { arrival: Arrival }) {
  const time = arrival.arrivedAt ?? arrival.recordedAt;
  return (
    <Box component="li" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2">
        {t('{name} : {time} ({method})', { name: name(arrival.teacher), time: formatDateTime(time), method: arrival.method === 'QR' ? t('scan du QR') : t('saisie') })}
      </Typography>
      {arrival.corrected && <Badge tone="info">{t('Arrivée corrigée')}</Badge>}
    </Box>
  );
}

function ChangeLine({ change }: { change: SituationChange }) {
  return (
    <Box component="li" sx={{ display: 'grid', gap: 0.25 }}>
      <Typography variant="body2" sx={{ fontWeight: font.medium }}>
        {KIND_LABELS[change.kind] ?? change.kind} · {formatDateTime(change.at)} · {name(change.by)}
      </Typography>
      <Muted>
        {t('Avant : {before}', { before: JSON.stringify(change.before) })} · {t('Après : {after}', { after: JSON.stringify(change.after) })}
      </Muted>
      {change.reason && <Muted>{t('Motif : {reason}', { reason: change.reason })}</Muted>}
      {change.madeAfterMoment && (
        <Box>
          <Badge tone="warning" icon={CircleAlert}>
            {t('Fait après l’instant demandé')}
          </Badge>
        </Box>
      )}
    </Box>
  );
}

const list = (label: string) => ({ component: 'ul' as const, 'aria-label': label, sx: { listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 } });

/** Impression : seule la situation reste visible, sur une page. */
const PRINT_STYLES = {
  '@media print': {
    'body *': { visibility: 'hidden' },
    '.situation-print, .situation-print *': { visibility: 'visible' },
    '.situation-print': { position: 'absolute', left: 0, top: 0, width: '100%', padding: '12mm' },
    '.no-print': { display: 'none !important' },
  },
};

interface SituationViewProps {
  situation: Situation;
  /** Personne qui édite la page (en-tête imprimé). */
  editor: string;
}

/** Une rubrique par fait de la situation, chacune avec sa disponibilité (connue, probable, aucune, indisponible). */
export function SituationView({ situation: s, editor }: SituationViewProps) {
  const tz = s.moment.timeZone;
  return (
    <Box className="situation-print" sx={{ display: 'grid', gap: 1.5 }}>
      <GlobalStyles styles={PRINT_STYLES} />
      <Box>
        <Typography component="h2" sx={{ fontSize: fontSize.lg, fontWeight: font.semibold }}>
          {t('Situation de {name}', { name: `${s.student.firstName} ${s.student.lastName}` })}
        </Typography>
        <Typography variant="body2">{t('Instant demandé : {moment} ({tz})', { moment: s.moment.requested.replace('T', ' '), tz })}</Typography>
        <Muted>{t('Édité par {name} le {date}', { name: editor, date: formatDateTime(new Date()) })}</Muted>
      </Box>

      <SectionBlock title={t('Classe')} section={s.class}>
        {s.class.value && (
          <>
            <Line>{s.class.value.name}</Line>
            <Muted>{[s.class.value.level, s.class.value.floor, s.class.value.room].filter(Boolean).join(' · ')}</Muted>
            <Muted>{t('Depuis le {from}', { from: formatDateTime(s.class.value.since) })}</Muted>
          </>
        )}
      </SectionBlock>

      <SectionBlock title={t('Séance prévue')} section={s.session}>
        {s.session.availability === 'NONE' && <Line>{t('Aucune séance prévue à cet instant.')}</Line>}
        {s.session.value && (
          <>
            <Line>
              {[s.session.value.subject ?? t('Séance'), t('titulaire : {name}', { name: name(s.session.value.teacher) })].join(' · ')}
            </Line>
            <Muted>
              {t('De {from} à {to}', { from: formatDateTime(s.session.value.startAt), to: formatDateTime(s.session.value.endAt) })}
              {s.session.value.room ? ` · ${s.session.value.room}` : ''}
            </Muted>
            {s.session.value.status === 'CANCELLED' && (
              <Line>
                {t('Séance annulée : {reason}', { reason: s.session.value.cancellation?.reason ?? t('sans motif') })}
                {s.session.value.cancellation?.at ? ` · ${formatDateTime(s.session.value.cancellation.at)}` : ''}
                {s.session.value.cancellation?.by ? ` · ${name(s.session.value.cancellation.by)}` : ''}
              </Line>
            )}
          </>
        )}
      </SectionBlock>

      <SectionBlock title={t('Enseignant sur place')} section={s.teacher}>
        {s.teacher.availability === 'NONE' && <Line>{t('Aucune arrivée enregistrée à cet instant.')}</Line>}
        {s.teacher.value && (
          <>
            {s.teacher.value.arrivals.length > 0 && <Box {...list(t('Arrivées'))}>{s.teacher.value.arrivals.map((a, i) => <ArrivalLine key={i} arrival={a} />)}</Box>}
            {s.teacher.value.absences.length > 0 && (
              <Box {...list(t('Absences saisies'))}>
                {s.teacher.value.absences.map((a, i) => (
                  <Box component="li" key={i}>
                    <Typography variant="body2">{t('{name} : absence saisie', { name: name(a.teacher) })}{a.comment ? ` (${a.comment})` : ''}</Typography>
                  </Box>
                ))}
              </Box>
            )}
            {s.teacher.value.laterArrivals.length > 0 && (
              <>
                <Muted>{t('Arrivée enregistrée plus tard que l’instant demandé :')}</Muted>
                <Box {...list(t('Arrivées plus tardives'))}>{s.teacher.value.laterArrivals.map((a, i) => <ArrivalLine key={i} arrival={a} />)}</Box>
              </>
            )}
            {s.teacher.value.departures.map((d, i) => (
              <Line key={i}>{t('{name} avait quitté l’établissement à {time} et n’était pas revenu(e).', { name: name(d.teacher), time: formatDateTime(d.departedAt) })}</Line>
            ))}
            {s.teacher.value.dayLevelOnly && <Muted>{t('L’arrivée est enregistrée pour la journée : l’enseignant a plusieurs séances dans cette classe ce jour-là.')}</Muted>}
          </>
        )}
      </SectionBlock>

      <SectionBlock title={t('Annonce de retard ou d’absence')} section={s.announcement}>
        {s.announcement.availability === 'NONE' && <Line>{t('Aucune annonce de retard ou d’absence.')}</Line>}
        {s.announcement.value && (
          <>
            <Line>
              {s.announcement.value.type === 'ABSENCE' ? t('Absence annoncée') : t('Retard annoncé')}
              {s.announcement.value.announcedLateMinutes ? ` · ${t('{count} min', { count: s.announcement.value.announcedLateMinutes })}` : ''}
              {' · '}
              {t('annoncée le {date}', { date: formatDateTime(s.announcement.value.announcedAt) })}
            </Line>
            {s.announcement.value.anonymized ? <Muted>{t('Données anonymisées.')}</Muted> : s.announcement.value.reason && <Muted>{t('Motif : {reason}', { reason: s.announcement.value.reason })}</Muted>}
          </>
        )}
      </SectionBlock>

      <SectionBlock title={t('Remplaçant')} section={s.substitute}>
        {s.substitute.availability === 'NONE' && <Line>{t('Aucun remplaçant désigné à cet instant.')}</Line>}
        {s.substitute.value && (
          <>
            {s.substitute.value.inForce && <Line>{t('Remplaçant autorisé : {name}', { name: name(s.substitute.value.inForce) })}</Line>}
            {s.substitute.value.arrived && (
              <Line>{t('{name} est arrivé(e) : {time}', { name: name(s.substitute.value.arrived.teacher), time: formatDateTime(s.substitute.value.arrived.arrivedAt ?? s.substitute.value.arrived.recordedAt) })}</Line>
            )}
            {s.substitute.value.previous.length > 0 && (
              <Box {...list(t('Désignations successives'))}>
                {s.substitute.value.previous.map((p, i) => (
                  <Box component="li" key={i}>
                    <Muted>
                      {t('{name}, désigné(e) le {date} par {by}', { name: name(p.teacher), date: formatDateTime(p.setAt), by: name(p.setBy) })}
                      {p.madeAfterMoment ? ` · ${t('après l’instant demandé')}` : ''}
                    </Muted>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </SectionBlock>

      <SectionBlock title={t('Surveillants')} section={s.supervisors}>
        {s.supervisors.availability === 'NONE' && <Line>{t('Aucune garde enregistrée à cet instant.')}</Line>}
        {s.supervisors.value && (
          <>
            {s.supervisors.value.assignee ? (
              <Line>
                {name(s.supervisors.value.assignee.user)} ·{' '}
                {s.supervisors.value.assignee.state === 'PRESENT'
                  ? t('Présent(e) depuis {time}', { time: s.supervisors.value.assignee.presentSince ? formatDateTime(s.supervisors.value.assignee.presentSince) : '—' })
                  : t('Affecté(e), présence non enregistrée à cet instant')}
              </Line>
            ) : (
              <Line>{t('Garde ouverte, sans surveillant affecté à cet instant.')}</Line>
            )}
            {s.supervisors.value.reinforcements.length > 0 && (
              <Box {...list(t('Renforts'))}>
                {s.supervisors.value.reinforcements.map((r, i) => (
                  <Box component="li" key={i}>
                    <Muted>{t('Renfort : {name} depuis {time}', { name: name(r.user), time: formatDateTime(r.joinedAt) })}</Muted>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </SectionBlock>

      <SectionBlock title={t('Modifications')} section={s.changes}>
        {s.changes.availability === 'NONE' && <Line>{t('Aucune modification enregistrée ce jour-là.')}</Line>}
        {s.changes.value && <Box {...list(t('Modifications du jour'))}>{s.changes.value.map((c, i) => <ChangeLine key={i} change={c} />)}</Box>}
      </SectionBlock>
    </Box>
  );
}
