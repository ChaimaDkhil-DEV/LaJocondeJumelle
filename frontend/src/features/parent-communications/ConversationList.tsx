import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { UserAvatar } from '../../components/UserAvatar';
import { icon, radius } from '../../design/tokens';
import { t } from '../../i18n';
import {
  TYPE_LABELS,
  fullName,
  useConversations,
  useInbox,
  type ConversationSummary,
  type Space,
} from './api';
import { ConversationLink } from './ChatParts';
import { filterConversations, type ConversationFilter } from './communicationsView';
import { counterpart } from './ConversationView';

/** Ligne d'une conversation : élève, interlocuteur et classe, aperçu du dernier message. */
export function ConversationLine({
  space,
  c,
  selected,
  to,
}: {
  space: Space;
  c: ConversationSummary;
  selected: boolean;
  to: string;
}) {
  const kind = space === 'admin' ? `${TYPE_LABELS[c.type]} · ` : '';
  return (
    <ConversationLink
      to={to}
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

const pill = { '& .MuiOutlinedInput-root': { borderRadius: `${radius.round}px` } };

const FILTERS: Array<{ key: ConversationFilter; label: string }> = [
  { key: 'all', label: t('Tous') },
  { key: 'unread', label: t('Non lus') },
  { key: 'teachers', label: t('Enseignants') },
  { key: 'parents', label: t('Parents') },
  { key: 'archived', label: t('Archivés') },
];

/** Boutons-filtres en pilules (un seul actif) : ils remplacent les listes déroulantes Type et État. */
function FilterPills({
  value,
  onChange,
}: {
  value: ConversationFilter;
  onChange: (filter: ConversationFilter) => void;
}) {
  return (
    <Box
      role="group"
      aria-label={t('Filtrer les conversations')}
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}
    >
      {FILTERS.map(({ key, label }) => {
        const active = key === value;
        return (
          <Button
            key={key}
            size="small"
            variant={active ? 'contained' : 'outlined'}
            color={active ? 'primary' : 'inherit'}
            aria-pressed={active}
            onClick={() => onChange(key)}
            sx={{ minHeight: 44, minWidth: 44, px: 1.75, borderRadius: `${radius.round}px` }}
          >
            {label}
          </Button>
        );
      })}
    </Box>
  );
}

/**
 * Colonne gauche de l'administration : recherche, boutons-filtres, conversations de la vue choisie
 * (boîte de réception ou toutes les conversations). `hrefOf` donne l'adresse d'une conversation.
 */
export function AdminConversationList({
  vue,
  selectedId,
  hrefOf,
}: {
  vue: 'boite' | 'conversations';
  selectedId: string | null;
  hrefOf: (id: string) => string;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const inbox = useInbox(vue === 'boite');
  // « Conversations » : la recherche est faite par le serveur (toutes les pages) ; la boîte, filtrée ici.
  const all = useConversations('admin', { q: query.trim() || undefined }, vue === 'conversations');
  const list = vue === 'boite' ? inbox : all;
  const shown = filterConversations(list.data ?? [], {
    filter,
    q: vue === 'boite' ? query : undefined,
  });
  return (
    <>
      <Box sx={{ display: 'grid', gap: 1.25, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          type="search"
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Rechercher un élève')}
          sx={pill}
          slotProps={{
            htmlInput: { 'aria-label': t('Rechercher un élève'), style: { minHeight: 28 } },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={icon.sm} strokeWidth={icon.stroke} aria-hidden="true" />
                </InputAdornment>
              ),
            },
          }}
        />
        <FilterPills value={filter} onChange={setFilter} />
      </Box>
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState
          message={t('Les conversations n’ont pas pu être chargées.')}
          onAction={() => void list.refetch()}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          compact
          title={vue === 'boite' ? t('Aucun nouveau message') : t('Aucune conversation')}
          description={
            vue === 'boite'
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
          {shown.map((c) => (
            <ConversationLine
              key={c.id}
              space="admin"
              c={c}
              selected={c.id === selectedId}
              to={hrefOf(c.id)}
            />
          ))}
        </Box>
      )}
    </>
  );
}

/**
 * Colonne gauche de l'enseignant : « Nouveau message », recherche par élève, conversations.
 * `hrefOf` donne l'adresse d'une conversation (même page, `?conversation=<id>`).
 */
export function TeacherConversationList({
  selectedId,
  hrefOf,
  onNew,
}: {
  selectedId: string | null;
  hrefOf: (id: string) => string;
  onNew: () => void;
}) {
  const list = useConversations('teacher');
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const shown = (list.data ?? []).filter(
    (c) => !needle || fullName(c.student).toLocaleLowerCase().includes(needle),
  );
  return (
    <>
      <Box sx={{ display: 'grid', gap: 1.25, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Button
          variant="contained"
          fullWidth
          onClick={onNew}
          startIcon={<Plus size={icon.md} strokeWidth={icon.stroke} aria-hidden="true" />}
          sx={{ minHeight: 48, borderRadius: `${radius.round}px` }}
        >
          {t('Nouveau message')}
        </Button>
        <TextField
          type="search"
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Rechercher un élève')}
          sx={pill}
          slotProps={{
            htmlInput: { 'aria-label': t('Rechercher un élève'), style: { minHeight: 28 } },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={icon.sm} strokeWidth={icon.stroke} aria-hidden="true" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState
          message={t('Les conversations n’ont pas pu être chargées.')}
          onAction={() => void list.refetch()}
        />
      ) : shown.length === 0 ? (
        <EmptyState compact title={t('Aucune conversation')} />
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
          {shown.map((c) => (
            <ConversationLine
              key={c.id}
              space="teacher"
              c={c}
              selected={c.id === selectedId}
              to={hrefOf(c.id)}
            />
          ))}
        </Box>
      )}
    </>
  );
}
