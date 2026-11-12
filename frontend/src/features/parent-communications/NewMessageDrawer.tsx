import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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

/** Deux gros boutons à la place des boutons radio : Un enseignant / Un parent. */
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
    { type: 'INTERNAL', label: t('Un enseignant'), disabled: teacherDisabled },
    { type: 'PARENT', label: t('Un parent'), disabled: false },
  ];
  return (
    <Box role="group" aria-labelledby="new-message-recipient" sx={{ display: 'grid', gap: 1 }}>
      <Typography id="new-message-recipient" variant="subtitle2" component="p">
        {t('Destinataire')}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        {options.map(({ type, label, disabled }) => {
          const active = type === value;
          return (
            <Button
              key={type}
              variant={active ? 'contained' : 'outlined'}
              color={active ? 'primary' : 'inherit'}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(type)}
              sx={{ minHeight: 48, fontWeight: font.semibold }}
            >
              {label}
            </Button>
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

  // Élève choisi (ou prérempli par « Contacter le parent ») : affiché d'après ses destinataires.
  const knownStudents = recipients.data ? [recipients.data.student] : [];

  return (
    <Box sx={{ display: 'grid', gap: 2.5, p: { xs: 2, sm: 3 }, overflowY: 'auto' }}>
      {linkedInternalId && (
        <Alert severity="info">
          {t(
            'Message au parent à partir d’un signalement : rien de la conversation interne n’est transmis au parent.',
          )}
        </Alert>
      )}
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
