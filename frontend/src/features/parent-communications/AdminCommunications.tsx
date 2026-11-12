import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { Lock, LockOpen, Plus, UserCheck, Users } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { icon, radius } from '../../design/tokens';
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
import { CommunicationsTabs, PANEL_ID, tabId } from './CommunicationsTabs';
import { AdminConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import {
  NewMessageDrawer,
  type NewMessagePrefill,
  type RecipientType,
} from './NewMessageDrawer';
import { ValidationList, ValidationPanel } from './ValidationPanel';

/** Actions de 44 px au moins : le public aime les boutons, souvent utilisés au doigt. */
const action = { minHeight: 44 };

function ConversationActions({
  c,
  onContactParent,
}: {
  c: ConversationSummary;
  onContactParent: () => void;
}) {
  const me = useCurrentUser().data;
  const actions = useConversationActions(c.id);
  if (c.type === 'LEGACY_TEACHER_PARENT') return null;
  const mine = c.responsibleAdmin?.id === me?.id;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'flex-end' }}>
      {c.type === 'INTERNAL' && (
        <Button
          variant="outlined"
          startIcon={<Users size={icon.sm} aria-hidden="true" />}
          onClick={onContactParent}
          sx={action}
        >
          {t('Contacter le parent')}
        </Button>
      )}
      <Button
        startIcon={<UserCheck size={icon.sm} aria-hidden="true" />}
        onClick={() => actions.responsible.mutate(mine ? null : (me?.id ?? null))}
        loading={actions.responsible.isPending}
        sx={action}
      >
        {mine ? t('Libérer') : t('Prendre en charge')}
      </Button>
      {c.status === 'OPEN' ? (
        <Button
          color="inherit"
          startIcon={<Lock size={icon.sm} aria-hidden="true" />}
          onClick={() => actions.close.mutate()}
          loading={actions.close.isPending}
          sx={action}
        >
          {t('Clôturer')}
        </Button>
      ) : (
        <Button
          color="inherit"
          startIcon={<LockOpen size={icon.sm} aria-hidden="true" />}
          onClick={() => actions.reopen.mutate()}
          loading={actions.reopen.isPending}
          sx={action}
        >
          {t('Rouvrir')}
        </Button>
      )}
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
      <PageHeader
        title={t('Communications')}
        breadcrumb={false}
        actions={
          <Button
            variant="contained"
            onClick={() => openComposer()}
            startIcon={<Plus size={icon.md} strokeWidth={icon.stroke} aria-hidden="true" />}
            sx={{ minHeight: 48, px: 2.5, borderRadius: `${radius.round}px` }}
          >
            {t('Nouveau message')}
          </Button>
        }
      />
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
