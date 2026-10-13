import AttachFileIcon from '@mui/icons-material/AttachFile';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ApiError, fieldErrors } from '../../api/client';
import { uploadFile } from '../../api/uploads';
import { saveToOutbox } from '../outbox/outbox';
import { OUTBOX_KEY } from '../outbox/useOutbox';
import { isRetryableError } from '../requests/api';
import { useClientSettings } from '../../api/settings';
import { VoiceRecorder, type VoiceRecording } from '../voice/VoiceRecorder';
import { messageKeys, submitMessage, type NewMessageInput } from './api';
import { FilePickerButton } from './FilePickerButton';
import { PhotoCapture, type UploadedPhoto } from './PhotoCapture';

interface ComposerProps {
  requestId: string;
  requestTitle: string;
}

interface UploadedDocument {
  id: string;
  name: string;
}

const EMPTY_MESSAGE = 'Écrivez un message, enregistrez un vocal ou joignez un fichier.';

/** Réponse dans le fil : texte, vocal, photos et documents PDF. */
export function MessageComposer({ requestId, requestTitle }: ComposerProps) {
  const queryClient = useQueryClient();
  const { voiceMaxSeconds } = useClientSettings();
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<VoiceRecording | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyError, setEmptyError] = useState(false);
  const [sending, setSending] = useState(false);
  // Clé du composant vocal : la changer réinitialise l'enregistreur après un envoi.
  const [voiceKey, setVoiceKey] = useState(0);

  function reset(): void {
    setClientId(crypto.randomUUID());
    setText('');
    setVoice(null);
    setPhotos([]);
    setDocuments([]);
    setVoiceKey((k) => k + 1);
  }

  async function handleDocument(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setUploadingDocument(true);
    try {
      const uploaded = await uploadFile('DOCUMENT', file, file.name, requestId);
      setDocuments((docs) => [...docs, { id: uploaded.id, name: file.name }]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Le fichier n’a pas pu être envoyé. Réessayez.');
    } finally {
      setUploadingDocument(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const trimmed = text.trim();
    const attachmentFileIds = [...photos.map((p) => p.id), ...documents.map((d) => d.id)];
    if (!trimmed && !voice && attachmentFileIds.length === 0) {
      setEmptyError(true);
      return;
    }
    setEmptyError(false);

    const input: NewMessageInput = {
      clientId,
      requestId,
      ...(trimmed ? { text: trimmed } : {}),
      ...(voice ? { voice: { blob: voice.blob, mimeType: voice.mimeType, durationSeconds: voice.durationSeconds } } : {}),
      attachmentFileIds,
    };

    setSending(true);
    try {
      await submitMessage(input);
      reset();
      await queryClient.invalidateQueries({ queryKey: messageKeys.thread(requestId) });
    } catch (e) {
      if (isRetryableError(e)) {
        await saveToOutbox({
          type: 'message',
          id: clientId,
          savedAt: new Date().toISOString(),
          payload: input,
          requestTitle,
          lastError: e instanceof ApiError ? e.message : 'Envoi impossible.',
        });
        await queryClient.invalidateQueries({ queryKey: OUTBOX_KEY });
        reset();
        setError(
          'Votre message n’a pas pu être envoyé (connexion impossible). Il est conservé dans la boîte d’envoi : ' +
            'vous pourrez le renvoyer depuis la liste des demandes.',
        );
      } else {
        const fields = fieldErrors(e);
        setError(Object.values(fields)[0] ?? (e instanceof ApiError ? e.message : 'Envoi impossible.'));
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Box component="form" noValidate onSubmit={(e: FormEvent<HTMLFormElement>) => void handleSubmit(e)}>
      <Stack spacing={2}>
        <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
          Répondre
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          id={`message-${requestId}`}
          label="Votre message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          multiline
          minRows={2}
          error={emptyError}
          helperText={emptyError ? EMPTY_MESSAGE : undefined}
          slotProps={{ htmlInput: { maxLength: 4000 } }}
        />
        <VoiceRecorder key={voiceKey} maxSeconds={voiceMaxSeconds} value={voice} onChange={setVoice} />
        <PhotoCapture value={photos} onChange={setPhotos} requestId={requestId} altPrefix="Photo à joindre" />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <FilePickerButton
            label="Joindre un PDF"
            icon={<AttachFileIcon aria-hidden="true" />}
            accept="application/pdf"
            disabled={uploadingDocument}
            onChange={(e) => void handleDocument(e)}
          />
          {documents.map((doc) => (
            <Chip
              key={doc.id}
              label={doc.name}
              onDelete={() => setDocuments((docs) => docs.filter((d) => d.id !== doc.id))}
              slotProps={{ root: { 'aria-label': doc.name } }}
            />
          ))}
        </Box>
        <Box>
          <Button type="submit" variant="contained" loading={sending}>
            Envoyer le message
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
