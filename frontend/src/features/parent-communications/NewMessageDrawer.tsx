import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Drawer from '@mui/material/Drawer';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { font, icon, radius, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import { useStudents } from '../students/api';
import { fullName, useRecipients, useSendMode, useStartConversation } from './api';
import { MessageComposer } from './ChatParts';

export type RecipientType = 'INTERNAL' | 'PARENT';

/** Préremplissage du panneau : « Contacter le parent » d'un signalement, ou ancienne adresse. */
export interface NewMessagePrefill {
  type?: RecipientType;
  studentId?: string;
  linkedInternalId?: string;
}

const TITLE_ID = 'new-message-title';

/** Élèves actifs dont le nom ou le prénom contient la recherche (deux lettres au moins). */
function useStudentSearch(query: string) {
  const students = useStudents();
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < 2 || !students.data) return [];
  return students.data
    .filter((s) => s.active && `${s.firstName} ${s.lastName}`.toLocaleLowerCase().includes(needle))
    .slice(0, 20);
}

type StudentOption = { id: string; firstName: string; lastName: string; class: { name: string } };

/** Élève : recherche par nom, suggestions cliquables, ou élève prérempli. */
function StudentPicker({
  value,
  onChange,
  known,
  locked,
}: {
  value: string;
  onChange: (id: string) => void;
  known: StudentOption[];
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
          <Button size="small" onClick={() => onChange('')} sx={{ minHeight: 44 }}>
            {t('Changer d’élève')}
          </Button>
        )}
      </Box>
    );
  }
  const choose = (id: string) => onChange(id);
  const onKey = (event: KeyboardEvent<HTMLElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(id);
    }
  };
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <TextField
        label={t('Rechercher un élève')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        helperText={t('Nom ou prénom, au moins deux lettres')}
      />
      {matches.length > 0 && (
        <Box
          component="ul"
          role="listbox"
          aria-label={t('Élèves trouvés')}
          sx={(theme) => ({
            listStyle: 'none',
            m: 0,
            p: 0.5,
            maxHeight: 240,
            overflowY: 'auto',
            border: `1px solid ${tokensOf(theme).border}`,
            borderRadius: `${radius.control}px`,
          })}
        >
          {matches.map((s) => (
            <Box
              component="li"
              key={s.id}
              role="option"
              aria-selected={s.id === value}
              tabIndex={0}
              onClick={() => choose(s.id)}
              onKeyDown={(e: KeyboardEvent<HTMLElement>) => onKey(e, s.id)}
              sx={(theme) => ({
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                px: 1.5,
                borderRadius: `${radius.control}px`,
                cursor: 'pointer',
                '&:hover': { bgcolor: tokensOf(theme).surfaceMuted },
                '&:focus-visible': { outline: `2px solid ${tokensOf(theme).focus}` },
              })}
            >
              {fullName(s)} — {s.class.name}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** Sélecteur segmenté Enseignant | Parent : un seul segment actif (teinte douce, pas de bouton plein). */
function RecipientTypeButtons({
  value,
  onChange,
  teacherDisabled,
}: {
  value: RecipientType;
  onChange: (type: RecipientType) => void;
  teacherDisabled: boolean;
}) {
  const options: Array<{ type: RecipientType; label: string; disabled: boolean }> = [
    { type: 'INTERNAL', label: t('Enseignant'), disabled: teacherDisabled },
    { type: 'PARENT', label: t('Parent'), disabled: false },
  ];
  return (
    <Box role="group" aria-labelledby="new-message-recipient" sx={{ display: 'grid', gap: 1 }}>
      <Typography id="new-message-recipient" variant="subtitle2" component="p">
        {t('Destinataire')}
      </Typography>
      <Box
        sx={(theme) => ({
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          p: 0.5,
          gap: 0.5,
          borderRadius: '12px',
          bgcolor: tokensOf(theme).surfaceMuted,
        })}
      >
        {options.map(({ type, label, disabled }) => {
          const active = type === value;
          return (
            <ButtonBase
              key={type}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(type)}
              sx={(theme) => {
                const tk = tokensOf(theme);
                return {
                  minHeight: 44,
                  borderRadius: '9px',
                  fontWeight: active ? font.semibold : font.medium,
                  color: active ? tk.accent.text : tk.textSecondary,
                  bgcolor: active ? tk.surface : 'transparent',
                  boxShadow: active ? '0 1px 2px rgba(16, 24, 40, 0.08)' : 'none',
                  '&.Mui-disabled': { opacity: 0.45 },
                  '&.Mui-focusVisible': { outline: `2px solid ${tk.focus}`, outlineOffset: 1 },
                };
              }}
            >
              {label}
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}

function NewMessageForm({
  prefill,
  onCreated,
}: {
  prefill: NewMessagePrefill;
  onCreated: (conversationId: string) => void;
}) {
  const { linkedInternalId } = prefill;
  const [type, setType] = useState<RecipientType>(prefill.type === 'PARENT' ? 'PARENT' : 'INTERNAL');
  const [studentId, setStudentId] = useState(prefill.studentId ?? '');
  const [recipientId, setRecipientId] = useState('');
  const recipients = useRecipients(studentId || undefined);
  const sendMode = useSendMode();
  const start = useStartConversation('admin');
  const forbidden = type === 'PARENT' && sendMode.data?.toParents === 'FORBIDDEN';
  // Élève sans représentant lié : rien à envoyer à un parent (alerte rouge, « Envoyer » désactivé).
  const noGuardian = type === 'PARENT' && Boolean(studentId) && recipients.data?.guardians.length === 0;

  // Élève choisi (ou prérempli par « Contacter le parent ») : affiché d'après ses destinataires.
  const knownStudents = recipients.data ? [recipients.data.student] : [];

  return (
    <Box sx={{ display: 'grid', gap: 2.5, p: { xs: 2, sm: 3 }, overflowY: 'auto' }}>
      <RecipientTypeButtons
        value={type}
        teacherDisabled={Boolean(linkedInternalId)}
        onChange={(next) => {
          setType(next);
          setRecipientId('');
        }}
      />
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
                    sx={{ minHeight: 44 }}
                  />
                ))
              : recipients.data.guardians.map((g) => (
                  <FormControlLabel
                    key={g.id}
                    value={g.id}
                    control={<Radio />}
                    disabled={!g.hasActiveAccount}
                    sx={{ minHeight: 44 }}
                    label={`${fullName(g)}${g.relationship ? ` (${g.relationship})` : ''}${g.hasActiveAccount ? '' : ` — ${t('sans compte parent')}`}`}
                  />
                ))}
          </RadioGroup>
          {type === 'INTERNAL' && recipients.data.teachers.length === 0 && (
            <Typography color="text.secondary">
              {t('Aucun enseignant n’est affecté à la classe de cet élève.')}
            </Typography>
          )}
        </FormControl>
      )}
      {noGuardian && (
        <Alert severity="error" role="alert">
          {t('Aucun représentant n’est lié à cet élève. Contactez l’administration pour en ajouter un.')}
        </Alert>
      )}
      {type === 'PARENT' && (
        <Typography variant="body2" color="text.secondary">
          {t('Rien de la conversation interne n’est transmis au parent.')}
        </Typography>
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
        ready={!noGuardian}
        submitLabel={t('Envoyer')}
        hint={
          type === 'PARENT'
            ? sendMode.data?.toParents === 'SUBMIT'
              ? t('Validé par l’administration avant l’envoi')
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
          onCreated(created.id);
        }}
      />
    </Box>
  );
}

/**
 * « Nouveau message » de l'administration : un panneau latéral sur la page unique, sans changer de
 * page. Le formulaire est monté à l'ouverture seulement : il repart vide à chaque fois.
 */
export function NewMessageDrawer({
  open,
  prefill,
  onClose,
  onCreated,
}: {
  open: boolean;
  prefill: NewMessagePrefill;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-modal': true,
          'aria-labelledby': TITLE_ID,
          sx: { width: 'min(520px, 100vw)', display: 'flex', flexDirection: 'column' },
        } as object,
      }}
    >
      <Box
        component="header"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: { xs: 2, sm: 3 },
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography id={TITLE_ID} component="h2" variant="h2" sx={{ fontSize: '1.25rem' }}>
          {t('Nouveau message')}
        </Typography>
        <IconButton
          aria-label={t('Fermer')}
          onClick={onClose}
          sx={{ width: 44, height: 44 }}
          edge="end"
        >
          <X size={icon.md} strokeWidth={icon.stroke} aria-hidden="true" />
        </IconButton>
      </Box>
      <NewMessageForm prefill={prefill} onCreated={onCreated} />
    </Drawer>
  );
}
