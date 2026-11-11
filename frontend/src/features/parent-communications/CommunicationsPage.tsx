import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  ClipboardCheck,
  Inbox,
  Lock,
  LockOpen,
  MessageSquarePlus,
  MessagesSquare,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { UserAvatar } from '../../components/UserAvatar';
import { font, icon, radius, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import { canUseAdministrationSpace } from '../admin/access';
import { useCurrentUser } from '../auth/useCurrentUser';
import { useStudents } from '../students/api';
import {
  TYPE_LABELS,
  fullName,
  useConversation,
  useConversationActions,
  useConversations,
  useInbox,
  useRecipients,
  useSendMode,
  useStartConversation,
  useTeacherStudents,
  useToValidate,
  type ConversationSummary,
  type Space,
} from './api';
import { ChatShell, ConversationLink, MessageComposer } from './ChatParts';
import { ConversationView, counterpart } from './ConversationView';
import { ValidationView } from './ValidationView';

export type CommunicationsView = 'home' | 'new' | 'conversations' | 'inbox' | 'validation';

const ROOT = '/communications';

/** Grand bouton d'action de l'écran d'accueil (« boutons visibles plutôt que menus »). */
function ActionTile({
  to,
  icon: Icon,
  title,
  description,
  count,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <Box
      component={RouterLink}
      to={to}
      sx={(theme) => {
        const tk = tokensOf(theme);
        return {
          display: 'grid',
          gridTemplateColumns: '44px minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 1.5,
          p: { xs: 2, sm: 2.5 },
          minHeight: 88,
          borderRadius: `${radius.card}px`,
          border: `1px solid ${tk.border}`,
          bgcolor: tk.surface,
          color: 'text.primary',
          textDecoration: 'none',
          '&:hover': { bgcolor: tk.surfaceMuted },
          '&:focus-visible': { outline: `2px solid ${tk.focus}`, outlineOffset: 2 },
        };
      }}
    >
      <Box
        aria-hidden="true"
        sx={(theme) => ({
          width: 44,
          height: 44,
          display: 'grid',
          placeItems: 'center',
          borderRadius: `${radius.control}px`,
          bgcolor: tokensOf(theme).accent.soft,
          color: tokensOf(theme).accent.main,
        })}
      >
        <Icon size={icon.lg} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="span" sx={{ display: 'block', fontWeight: font.semibold }}>
          {title}
        </Typography>
        <Typography component="span" variant="body2" color="text.secondary">
          {description}
        </Typography>
      </Box>
      {count ? <Badge tone="accent">{count}</Badge> : <span />}
    </Box>
  );
}

function Home({ space }: { space: Space }) {
  const admin = space === 'admin';
  const sendMode = useSendMode(admin);
  const inbox = useInbox(admin);
  const canValidate = admin && sendMode.data?.canValidate === true;
  const toValidate = useToValidate(canValidate);
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: { xs: '1fr', md: admin ? '1fr 1fr' : '1fr' },
        maxWidth: admin ? 900 : 560,
      }}
    >
      {admin && (
        <ActionTile
          to={`${ROOT}/boite`}
          icon={Inbox}
          title={t('Boîte de réception')}
          description={t('Messages des enseignants et des parents à lire')}
          count={inbox.data?.length}
        />
      )}
      <ActionTile
        to={`${ROOT}/nouveau`}
        icon={MessageSquarePlus}
        title={t('Nouveau message')}
        description={
          admin
            ? t('Écrire à un enseignant ou à un parent')
            : t('Signaler à l’administration au sujet d’un élève')
        }
      />
      <ActionTile
        to={`${ROOT}/conversations`}
        icon={MessagesSquare}
        title={admin ? t('Conversations') : t('Mes conversations')}
        description={
          admin
            ? t('Retrouver tous les échanges')
            : t('Vos échanges avec l’administration et leur état')
        }
      />
      {canValidate && (
        <ActionTile
          to={`${ROOT}/a-valider`}
          icon={ClipboardCheck}
          title={t('À valider')}
          description={t('Messages aux parents en attente d’approbation')}
          count={toValidate.data?.filter((m) => m.decidable).length}
        />
      )}
    </Box>
  );
}

// ------------------------------------------------------------------ Nouveau message

/** Choix de l'élève : liste déroulante native, simple au clavier et sur mobile. */
function StudentSelect({
  students,
  value,
  onChange,
}: {
  students: Array<{ id: string; firstName: string; lastName: string; class: { name: string } }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <TextField
      select
      label={t('Élève')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
      sx={{ maxWidth: 480 }}
    >
      <option value="">{t('Choisir un élève')}</option>
      {students.map((s) => (
        <option key={s.id} value={s.id}>
          {fullName(s)} — {s.class.name}
        </option>
      ))}
    </TextField>
  );
}

function TeacherNewMessage() {
  const navigate = useNavigate();
  const students = useTeacherStudents();
  const start = useStartConversation('teacher');
  const [studentId, setStudentId] = useState('');
  if (students.isPending) return <LoadingState />;
  if (students.isError)
    return (
      <ErrorState
        message={t('Les élèves n’ont pas pu être chargés.')}
        onAction={() => void students.refetch()}
      />
    );
  return (
    <Paper variant="outlined" sx={{ display: 'grid', gap: 2, p: { xs: 1.5, sm: 2.5 } }}>
      <StudentSelect students={students.data} value={studentId} onChange={setStudentId} />
      <MessageComposer
        hint={t(
          'Le message part directement à l’administration. Un vocal suffit ; vous pouvez ajouter un texte.',
        )}
        onSend={async (input) => {
          if (!studentId) {
            throw new Error(t('Choisissez l’élève concerné.'));
          }
          const created = await start.mutateAsync({ ...input, studentId });
          navigate(`${ROOT}/conversations/${created.id}`);
        }}
      />
    </Paper>
  );
}

function AdminNewMessage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const linkedInternalId = params.get('linkedInternalId') ?? undefined;
  const [type, setType] = useState<'INTERNAL' | 'PARENT'>(
    params.get('type') === 'PARENT' ? 'PARENT' : 'INTERNAL',
  );
  const [studentId, setStudentId] = useState(params.get('studentId') ?? '');
  const [recipientId, setRecipientId] = useState('');
  const recipients = useRecipients(studentId || undefined);
  const sendMode = useSendMode();
  const start = useStartConversation('admin');
  const forbidden = type === 'PARENT' && sendMode.data?.toParents === 'FORBIDDEN';

  // Élève choisi (ou prérempli par « Contacter le parent ») : affiché d'après ses destinataires.
  const knownStudents = recipients.data ? [recipients.data.student] : [];

  return (
    <Paper variant="outlined" sx={{ display: 'grid', gap: 2, p: { xs: 1.5, sm: 2.5 } }}>
      {linkedInternalId && (
        <Alert severity="info">
          {t(
            'Message au parent à partir d’un signalement : rien de la conversation interne n’est transmis au parent.',
          )}
        </Alert>
      )}
      <FormControl>
        <FormLabel id="comm-type">{t('Destinataire')}</FormLabel>
        <RadioGroup
          row
          aria-labelledby="comm-type"
          value={type}
          onChange={(e) => {
            setType(e.target.value as 'INTERNAL' | 'PARENT');
            setRecipientId('');
          }}
        >
          <FormControlLabel
            value="INTERNAL"
            control={<Radio />}
            label={t('Un enseignant')}
            disabled={Boolean(linkedInternalId)}
          />
          <FormControlLabel value="PARENT" control={<Radio />} label={t('Un parent')} />
        </RadioGroup>
      </FormControl>
      <StudentPicker
        value={studentId}
        onChange={(id) => {
          setStudentId(id);
          setRecipientId('');
        }}
        known={knownStudents}
        locked={Boolean(linkedInternalId)}
      />
      {studentId && recipients.data && (
        <FormControl>
          <FormLabel id="comm-recipient">
            {type === 'INTERNAL' ? t('Enseignant de la classe') : t('Représentant')}
          </FormLabel>
          <RadioGroup
            aria-labelledby="comm-recipient"
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
          >
            {type === 'INTERNAL'
              ? recipients.data.teachers.map((teacher) => (
                  <FormControlLabel
                    key={teacher.id}
                    value={teacher.id}
                    control={<Radio />}
                    label={teacher.displayName}
                  />
                ))
              : recipients.data.guardians.map((g) => (
                  <FormControlLabel
                    key={g.id}
                    value={g.id}
                    control={<Radio />}
                    disabled={!g.hasActiveAccount}
                    label={`${fullName(g)}${g.relationship ? ` (${g.relationship})` : ''}${g.hasActiveAccount ? '' : ` — ${t('sans compte parent')}`}`}
                  />
                ))}
          </RadioGroup>
          {(type === 'INTERNAL' ? recipients.data.teachers : recipients.data.guardians).length ===
            0 && (
            <Typography color="text.secondary">
              {type === 'INTERNAL'
                ? t('Aucun enseignant n’est affecté à la classe de cet élève.')
                : t('Aucun représentant n’est lié à cet élève.')}
            </Typography>
          )}
        </FormControl>
      )}
      {forbidden && (
        <Alert severity="warning">
          {t(
            'Vous n’avez pas le droit d’écrire aux parents. Demandez la permission au super administrateur.',
          )}
        </Alert>
      )}
      <MessageComposer
        disabled={forbidden}
        submitLabel={
          type === 'PARENT' && sendMode.data?.toParents === 'SUBMIT'
            ? t('Envoyer pour validation')
            : t('Envoyer')
        }
        hint={
          type === 'PARENT'
            ? sendMode.data?.toParents === 'SUBMIT'
              ? t(
                  'Votre message sera validé par un autre membre de l’administration avant d’être transmis. Le parent voit « L’école ».',
                )
              : t('Le parent reçoit le message signé « L’école ».')
            : t('L’enseignant reçoit le message directement.')
        }
        onSend={async (input) => {
          if (!studentId || !recipientId) {
            const message = !studentId
              ? t('Choisissez l’élève concerné.')
              : t('Choisissez le destinataire.');
            throw new Error(message);
          }
          const created = await start.mutateAsync({
            ...input,
            type,
            studentId,
            ...(type === 'INTERNAL' ? { teacherId: recipientId } : { guardianId: recipientId }),
            ...(type === 'PARENT' && linkedInternalId ? { linkedInternalId } : {}),
          });
          navigate(`${ROOT}/conversations/${created.id}`);
        }}
      />
    </Paper>
  );
}

/** Élève : recherche par nom parmi les élèves (liste de l'administration), ou élève prérempli. */
function StudentPicker({
  value,
  onChange,
  known,
  locked,
}: {
  value: string;
  onChange: (id: string) => void;
  known: Array<{ id: string; firstName: string; lastName: string; class: { name: string } }>;
  locked: boolean;
}) {
  const [query, setQuery] = useState('');
  const matches = useStudentSearch(query);
  if (locked || (value && known.length > 0)) {
    const student = known.find((s) => s.id === value);
    return (
      <Box>
        <Typography variant="subtitle2" component="p">
          {t('Élève')}
        </Typography>
        <Typography>{student ? `${fullName(student)} — ${student.class.name}` : '…'}</Typography>
        {!locked && (
          <Button size="small" onClick={() => onChange('')}>
            {t('Changer d’élève')}
          </Button>
        )}
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 1, maxWidth: 480 }}>
      <TextField
        label={t('Rechercher un élève')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        helperText={t('Nom ou prénom, au moins deux lettres')}
      />
      {matches.length > 0 && (
        <TextField
          select
          label={t('Élève')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {matches.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {fullName(s)} — {s.class.name}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Box>
  );
}

/** Élèves actifs dont le nom ou le prénom contient la recherche (liste de l'administration). */
function useStudentSearch(query: string) {
  const students = useStudents();
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < 2 || !students.data) return [];
  return students.data
    .filter((s) => s.active && `${s.firstName} ${s.lastName}`.toLocaleLowerCase().includes(needle))
    .slice(0, 20);
}

// ------------------------------------------------------------------ Listes et conversations

function ConversationLine({
  space,
  c,
  selected,
  base,
}: {
  space: Space;
  c: ConversationSummary;
  selected: boolean;
  base: string;
}) {
  const kind = space === 'admin' ? `${TYPE_LABELS[c.type]} · ` : '';
  return (
    <ConversationLink
      to={`${base}/${c.id}`}
      avatar={<UserAvatar name={fullName(c.student)} id={c.student.id} size="lg" />}
      title={fullName(c.student)}
      subtitle={`${kind}${counterpart(space, c)} · ${c.student.class.name}${c.status === 'CLOSED' && c.type !== 'LEGACY_TEACHER_PARENT' ? ` · ${t('Clôturée')}` : ''}`}
      preview={c.lastMessage?.excerpt ?? (c.lastMessage?.hasVoice ? t('Message vocal') : '')}
      when={c.lastMessage?.at ?? c.lastMessageAt}
      unread={c.unread}
      selected={selected}
    />
  );
}

function AdminConversationActions({ c }: { c: ConversationSummary }) {
  const navigate = useNavigate();
  const me = useCurrentUser().data;
  const actions = useConversationActions(c.id);
  if (c.type === 'LEGACY_TEACHER_PARENT') return null;
  const mine = c.responsibleAdmin?.id === me?.id;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'flex-end' }}>
      {c.type === 'INTERNAL' && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<Users size={icon.sm} aria-hidden="true" />}
          onClick={() =>
            navigate(
              `${ROOT}/nouveau?type=PARENT&studentId=${c.student.id}&linkedInternalId=${c.id}`,
            )
          }
        >
          {t('Contacter le parent')}
        </Button>
      )}
      <Button
        size="small"
        startIcon={<UserCheck size={icon.sm} aria-hidden="true" />}
        onClick={() => actions.responsible.mutate(mine ? null : (me?.id ?? null))}
        loading={actions.responsible.isPending}
      >
        {mine ? t('Libérer') : t('Prendre en charge')}
      </Button>
      {c.status === 'OPEN' ? (
        <Button
          size="small"
          color="inherit"
          startIcon={<Lock size={icon.sm} aria-hidden="true" />}
          onClick={() => actions.close.mutate()}
          loading={actions.close.isPending}
        >
          {t('Clôturer')}
        </Button>
      ) : (
        <Button
          size="small"
          color="inherit"
          startIcon={<LockOpen size={icon.sm} aria-hidden="true" />}
          onClick={() => actions.reopen.mutate()}
          loading={actions.reopen.isPending}
        >
          {t('Rouvrir')}
        </Button>
      )}
    </Box>
  );
}

function OpenConversation({ space, id, backTo }: { space: Space; id: string; backTo: string }) {
  const conversation = useConversation(space, id);
  const sendMode = useSendMode(space === 'admin');
  if (conversation.isPending) return <LoadingState variant="detail" />;
  if (conversation.isError)
    return (
      <ErrorState
        message={t('Cette conversation est introuvable ou ne vous est pas accessible.')}
      />
    );
  const c = conversation.data;
  return (
    <ConversationView
      space={space}
      conversation={c}
      backTo={backTo}
      actions={space === 'admin' ? <AdminConversationActions c={c} /> : undefined}
      submitLabel={
        space === 'admin' && c.type === 'PARENT' && sendMode.data?.toParents === 'SUBMIT'
          ? t('Envoyer pour validation')
          : undefined
      }
    />
  );
}

function AdminFilters({
  filters,
  onChange,
}: {
  filters: Record<string, string | undefined>;
  onChange: (f: Record<string, string | undefined>) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: 1.25 }}>
      <TextField
        size="small"
        label={t('Rechercher')}
        value={filters.q ?? ''}
        onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
        sx={{ flex: '1 1 160px' }}
      />
      <TextField
        size="small"
        select
        label={t('Type')}
        value={filters.type ?? ''}
        onChange={(e) => onChange({ ...filters, type: e.target.value || undefined })}
        sx={{ minWidth: 120 }}
      >
        <MenuItem value="">{t('Tous')}</MenuItem>
        <MenuItem value="INTERNAL">{TYPE_LABELS.INTERNAL}</MenuItem>
        <MenuItem value="PARENT">{TYPE_LABELS.PARENT}</MenuItem>
        <MenuItem value="LEGACY_TEACHER_PARENT">{TYPE_LABELS.LEGACY_TEACHER_PARENT}</MenuItem>
      </TextField>
      <TextField
        size="small"
        select
        label={t('État')}
        value={filters.status ?? ''}
        onChange={(e) => onChange({ ...filters, status: e.target.value || undefined })}
        sx={{ minWidth: 120 }}
      >
        <MenuItem value="">{t('Tous')}</MenuItem>
        <MenuItem value="OPEN">{t('Ouvertes')}</MenuItem>
        <MenuItem value="CLOSED">{t('Clôturées')}</MenuItem>
      </TextField>
    </Box>
  );
}

function ConversationsScreen({ space, view }: { space: Space; view: 'conversations' | 'inbox' }) {
  const { id } = useParams();
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const all = useConversations(space, space === 'admin' ? filters : {});
  const inbox = useInbox(view === 'inbox');
  const list = view === 'inbox' ? inbox : all;
  const base = `${ROOT}/${view === 'inbox' ? 'boite' : 'conversations'}`;
  const listNode: ReactNode = (
    <>
      {space === 'admin' && view === 'conversations' && (
        <AdminFilters filters={filters} onChange={setFilters} />
      )}
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState
          message={t('Les conversations n’ont pas pu être chargées.')}
          onAction={() => void list.refetch()}
        />
      ) : list.data.length === 0 ? (
        <EmptyState
          compact
          title={view === 'inbox' ? t('Aucun nouveau message') : t('Aucune conversation')}
          description={
            view === 'inbox'
              ? t('Les messages non lus des enseignants et des parents apparaîtront ici.')
              : undefined
          }
        />
      ) : (
        <Box
          component="ul"
          aria-label={t('Conversations')}
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0.75,
            overflowY: 'auto',
            display: 'grid',
            gap: 0.25,
            alignContent: 'start',
          }}
        >
          {list.data.map((c) => (
            <ConversationLine key={c.id} space={space} c={c} selected={c.id === id} base={base} />
          ))}
        </Box>
      )}
    </>
  );
  return (
    <ChatShell
      list={listNode}
      detailOpen={Boolean(id)}
      detail={
        id ? (
          <OpenConversation space={space} id={id} backTo={base} />
        ) : (
          <EmptyState title={t('Choisissez une conversation')} />
        )
      }
    />
  );
}

// ------------------------------------------------------------------ Page

const TITLES: Record<CommunicationsView, string> = {
  home: t('Communications'),
  new: t('Nouveau message'),
  conversations: t('Conversations'),
  inbox: t('Boîte de réception'),
  validation: t('À valider'),
};

/**
 * « Communications » (017) : une seule entrée pour les enseignants et l'administration, des boutons
 * d'action plutôt que des sous-menus. L'enseignant écrit à l'administration ; l'administration à un
 * enseignant ou à un parent. Le serveur vérifie chaque accès.
 */
export function CommunicationsPage({ view = 'home' }: { view?: CommunicationsView }) {
  const me = useCurrentUser();
  if (me.isPending) return <LoadingState />;
  const space: Space = canUseAdministrationSpace(me.data) ? 'admin' : 'teacher';
  const title =
    view === 'conversations' && space === 'teacher' ? t('Mes conversations') : TITLES[view];
  return (
    <>
      <PageHeader
        title={title}
        back={view === 'home' ? undefined : { to: ROOT, label: t('Communications') }}
      />
      {view === 'home' && <Home space={space} />}
      {view === 'new' && (space === 'admin' ? <AdminNewMessage /> : <TeacherNewMessage />)}
      {(view === 'conversations' || view === 'inbox') && (
        <ConversationsScreen space={space} view={view} />
      )}
      {view === 'validation' && space === 'admin' && <ValidationView />}
    </>
  );
}
