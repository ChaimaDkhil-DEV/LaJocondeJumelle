import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { EllipsisVertical, Lock, LockOpen, UserCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { icon } from '../../design/tokens';
import { t } from '../../i18n';
import { useCurrentUser } from '../auth/useCurrentUser';
import {
  useConversation,
  useConversationActions,
  useInbox,
  useSendMode,
  useToValidate,
  type ConversationSummary,
} from './api';
import { ChatShell } from './ChatParts';
import {
  PARAM,
  PREFILL_KEYS,
  ROOT,
  parseVue,
  unreadTotal,
  type Vue,
} from './communicationsView';
import { BOTTOM_BAR_HEIGHT, CommunicationsBottomBar } from './CommunicationsBottomBar';
import { CommunicationsTabs, PANEL_ID, tabId } from './CommunicationsTabs';
import { NewMessageFab } from './NewMessageFab';
import { AdminConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import {
  NewMessageDrawer,
  type NewMessagePrefill,
  type RecipientType,
} from './NewMessageDrawer';
import { ValidationList, ValidationPanel } from './ValidationPanel';

/** Éléments de menu de 44 px au moins : le public aime les boutons, souvent utilisés au doigt. */
const action = { minHeight: 44 };

/**
 * Actions d'une conversation, dans le menu ⋮ de l'en-tête. « Prendre en charge » n'est affiché
 * directement que si personne n'est responsable ; sinon il (ou « Libérer ») rejoint le menu.
 */
function ConversationActions({
  c,
  onContactParent,
}: {
  c: ConversationSummary;
  onContactParent: () => void;
}) {
  const me = useCurrentUser().data;
  const actions = useConversationActions(c.id);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (c.type === 'LEGACY_TEACHER_PARENT') return null;
  const mine = c.responsibleAdmin?.id === me?.id;
  const unassigned = !c.responsibleAdmin;
  const close = () => setAnchor(null);
  const toggleResponsible = () => actions.responsible.mutate(mine ? null : (me?.id ?? null));
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {unassigned && (
        <Button
          size="small"
          onClick={toggleResponsible}
          loading={actions.responsible.isPending}
          sx={{ minHeight: 44 }}
        >
          {t('Prendre en charge')}
        </Button>
      )}
      <IconButton
        aria-label={t('Plus d’actions')}
        aria-haspopup="menu"
        aria-expanded={anchor ? true : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ width: 44, height: 44 }}
      >
        <EllipsisVertical size={icon.md} aria-hidden="true" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        {c.type === 'INTERNAL' && (
          <MenuItem
            sx={action}
            onClick={() => {
              close();
              onContactParent();
            }}
          >
            <ListItemIcon>
              <Users size={icon.sm} aria-hidden="true" />
            </ListItemIcon>
            {t('Contacter le parent')}
          </MenuItem>
        )}
        {!unassigned && (
          <MenuItem
            sx={action}
            onClick={() => {
              close();
              toggleResponsible();
            }}
          >
            <ListItemIcon>
              <UserCheck size={icon.sm} aria-hidden="true" />
            </ListItemIcon>
            {mine ? t('Libérer') : t('Prendre en charge')}
          </MenuItem>
        )}
        {c.status === 'OPEN' ? (
          <MenuItem
            sx={action}
            onClick={() => {
              close();
              actions.close.mutate();
            }}
          >
            <ListItemIcon>
              <Lock size={icon.sm} aria-hidden="true" />
            </ListItemIcon>
            {t('Clôturer')}
          </MenuItem>
        ) : (
          <MenuItem
            sx={action}
            onClick={() => {
              close();
              actions.reopen.mutate();
            }}
          >
            <ListItemIcon>
              <LockOpen size={icon.sm} aria-hidden="true" />
            </ListItemIcon>
            {t('Rouvrir')}
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}

function OpenConversation({
  id,
  backTo,
  onContactParent,
}: {
  id: string;
  backTo: string;
  onContactParent: (c: ConversationSummary) => void;
}) {
  const conversation = useConversation('admin', id);
  const sendMode = useSendMode();
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
      space="admin"
      conversation={c}
      backTo={backTo}
      actions={<ConversationActions c={c} onContactParent={() => onContactParent(c)} />}
      submitLabel={
        c.type === 'PARENT' && sendMode.data?.toParents === 'SUBMIT'
          ? t('Envoyer pour validation')
          : undefined
      }
    />
  );
}

/** Lecture du préremplissage dans l'adresse (`?nouveau&type=PARENT&studentId=…&linkedInternalId=…`). */
function readPrefill(params: URLSearchParams): NewMessagePrefill {
  const type = params.get('type');
  return {
    type: type === 'PARENT' || type === 'INTERNAL' ? (type as RecipientType) : undefined,
    studentId: params.get('studentId') ?? undefined,
    linkedInternalId: params.get('linkedInternalId') ?? undefined,
  };
}

/**
 * « Communications » de l'administration (017) : une seule page. Titre et « Nouveau message », trois
 * onglets (`?vue=boite|conversations|valider`), puis deux volets : la liste à gauche, la conversation
 * (`?conversation=<id>`) ou le message à examiner (`?message=<id>`) à droite. Le panneau d'écriture
 * s'ouvre par-dessus (`?nouveau`). Tout l'état est dans l'adresse : lien direct et bouton retour.
 */
export function AdminCommunications() {
  const [params, setParams] = useSearchParams();
  const sendMode = useSendMode();
  const canValidate = sendMode.data?.canValidate === true;
  const inbox = useInbox();
  const toValidate = useToValidate(canValidate);

  const vue = parseVue(params.get(PARAM.vue), canValidate);
  const conversationId = params.get(PARAM.conversation);
  const messageId = params.get(PARAM.message);
  const composing = params.has(PARAM.nouveau);

  const selectVue = (next: Vue) => setParams({ [PARAM.vue]: next });
  const closeComposer = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(PARAM.nouveau);
      for (const key of PREFILL_KEYS) next.delete(key);
      return next;
    });
  const openComposer = (prefill: Record<string, string> = {}) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(PARAM.nouveau, '');
      for (const [key, value] of Object.entries(prefill)) next.set(key, value);
      return next;
    });

  const base = `${ROOT}?${PARAM.vue}=${vue}`;
  const listHref = (id: string) =>
    `${base}&${vue === 'valider' ? PARAM.message : PARAM.conversation}=${encodeURIComponent(id)}`;
  const selectedId = vue === 'valider' ? messageId : conversationId;

  return (
    <>
      <PageHeader title={t('Messages')} breadcrumb={false} />
      {sendMode.isPending ? (
        <LoadingState />
      ) : (
        <>
          <CommunicationsTabs
            vue={vue}
            onChange={selectVue}
            canValidate={canValidate}
            unread={unreadTotal(inbox.data)}
            toValidate={toValidate.data?.filter((m) => m.decidable).length ?? 0}
          />
          <Box role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(vue)}>
            <ChatShell
              listWidth={340}
              height={780}
              fab={<NewMessageFab onClick={() => openComposer()} />}
              detailOpen={Boolean(selectedId)}
              detailLabel={vue === 'valider' ? t('Message à examiner') : t('Conversation')}
              list={
                vue === 'valider' ? (
                  <ValidationList selectedId={messageId} hrefOf={listHref} />
                ) : (
                  <AdminConversationList
                    key={vue}
                    vue={vue}
                    selectedId={conversationId}
                    hrefOf={listHref}
                  />
                )
              }
              detail={
                selectedId ? (
                  vue === 'valider' ? (
                    <ValidationPanel key={selectedId} id={selectedId} backTo={base} />
                  ) : (
                    <OpenConversation
                      key={selectedId}
                      id={selectedId}
                      backTo={base}
                      onContactParent={(c) =>
                        openComposer({
                          type: 'PARENT',
                          studentId: c.student.id,
                          linkedInternalId: c.id,
                        })
                      }
                    />
                  )
                ) : (
                  <EmptyState
                    title={
                      vue === 'valider'
                        ? t('Choisissez un message à examiner')
                        : t('Choisissez une conversation')
                    }
                  />
                )
              }
            />
          </Box>
        </>
      )}
      {/* Mobile : espace réservé sous la page, et barre d'onglets du bas (masquée dans une conversation). */}
      {!selectedId && !composing && (
        <>
          <Box sx={(theme) => ({ height: BOTTOM_BAR_HEIGHT, [theme.breakpoints.up('md')]: { display: 'none' } })} />
          <CommunicationsBottomBar
            active={vue === 'valider' ? 'valider' : 'messages'}
            messagesTo={`${ROOT}?${PARAM.vue}=conversations`}
            validerTo={canValidate ? `${ROOT}?${PARAM.vue}=valider` : undefined}
            unread={unreadTotal(inbox.data)}
            toValidate={toValidate.data?.filter((m) => m.decidable).length ?? 0}
          />
        </>
      )}
      <NewMessageDrawer
        open={composing}
        prefill={readPrefill(params)}
        onClose={closeComposer}
        onCreated={(id) =>
          setParams({ [PARAM.vue]: 'conversations', [PARAM.conversation]: id })
        }
      />
    </>
  );
}
