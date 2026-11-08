import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import { DoorOpen, QrCode } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { SectionCard } from '../../components/SectionCard';
import { icon } from '../../design/tokens';
import { QrScannerDialog } from '../attendance/QrScannerDialog';
import { classIdFromToken } from '../attendance/qrToken';
import { useCoverageClasses, useCoverageTeachers, useDeclareEmptyClass } from './api';
import type { EmptyClassResult } from './types';
import { t } from '../../i18n';

/** « Non précisé » : l'enseignant n'est jamais exigé (FR-015a). */
const NO_TEACHER = 'none';

/** Message selon l'issue de la déclaration (contracts/rest-api.md, FR-015d à FR-015g). */
export function outcomeMessage(result: EmptyClassResult, className: string): string {
  const responsible = result.assignedTo?.displayName ?? t('Un surveillant');
  switch (result.outcome) {
    case 'CREATED':
      return t('Classe {className} déclarée vide. L’affectation est à votre nom, en cours : l’admin est prévenue. Restez avec les élèves.', { className });
    case 'ATTACHED':
      return t('La demande de l’enseignant pour cette classe vous est affectée, en cours. L’admin est prévenue.');
    case 'SUPPORT':
      return t('Cette classe est déjà prise en charge par {responsible}. Vous êtes en renfort jusqu’à la décision de l’admin.', { responsible });
    case 'ALREADY_ASSIGNED':
      return t('{responsible} est déjà assigné(e) à cette classe. L’admin est prévenue et décidera ; vous pouvez reprendre votre tour.', { responsible });
    case 'MERGE_PROPOSED':
      return t('Classe {className} déclarée vide : l’affectation est à votre nom, en cours. Une demande existe déjà pour cette classe : l’admin vérifiera s’il s’agit du même cas.', { className });
  }
}

/**
 * Déclarer une classe vide pendant le tour (US2, FR-015), deux choix (013) :
 * - scanner le QR code de la porte, caméra dans l'application : la déclaration part dès la lecture, avec la
 *   classe du jeton, sans enseignant, le QR en preuve de présence (le serveur revérifie tout) ;
 * - le formulaire : la classe puis « Déclarer », enseignant facultatif ; ouverte depuis le lien du QR, la
 *   classe est présélectionnée et le QR transmis comme preuve de présence (R10).
 */
export function EmptyClassPage() {
  const [params] = useSearchParams();
  const qrToken = params.get('c') ?? undefined;
  const ids = { classes: useId(), error: useId() };
  const classes = useCoverageClasses();
  const teachers = useCoverageTeachers();
  const declare = useDeclareEmptyClass();
  const clientId = useRef(crypto.randomUUID());
  const [classId, setClassId] = useState(params.get('classe') ?? '');
  const [teacherId, setTeacherId] = useState(NO_TEACHER);
  const [classError, setClassError] = useState<string | null>(null);
  const [result, setResult] = useState<{ value: EmptyClassResult; className: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  /** Origine de la dernière déclaration : son refus s'affiche à côté du choix utilisé. */
  const [source, setSource] = useState<'scan' | 'form'>('form');
  const back = { to: '/gardes?onglet=mes-affectations', label: t('Mes affectations') };

  if (classes.isPending) return <LoadingState label={t('Chargement des classes')} variant="detail" />;
  if (classes.error) return <ErrorState message={t('Impossible de charger les classes.')} actionLabel={t('Réessayer')} onAction={() => void classes.refetch()} />;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!classId) {
      setClassError(t('Choisissez la classe.'));
      return;
    }
    setClassError(null);
    setSource('form');
    const className = classes.data?.find((c) => c.id === classId)?.name ?? '';
    declare.mutate(
      { clientId: clientId.current, classId, teacherId: teacherId === NO_TEACHER ? null : teacherId, ...(qrToken ? { qrToken } : {}) },
      { onSuccess: (value) => setResult({ value, className }) },
    );
  }

  /** QR lu par la caméra ou collé : la déclaration part aussitôt, sans autre saisie (013). */
  function declareFromQr(token: string): void {
    setScanning(false);
    const scannedClassId = classIdFromToken(token);
    if (!scannedClassId) return;
    setSource('scan');
    const className = classes.data?.find((c) => c.id === scannedClassId)?.name ?? '';
    declare.mutate(
      { clientId: clientId.current, classId: scannedClassId, teacherId: null, qrToken: token },
      { onSuccess: (value) => setResult({ value, className }) },
    );
  }

  function again(): void {
    clientId.current = crypto.randomUUID();
    declare.reset();
    setResult(null);
    setClassId('');
    setTeacherId(NO_TEACHER);
  }

  const scanner = scanning && <QrScannerDialog onToken={declareFromQr} onClose={() => setScanning(false)} />;

  if (declare.isPending && source === 'scan') {
    return (
      <>
        <PageHeader title={t('Déclarer une classe vide')} back={back} />
        <LoadingState label={t('Déclaration de la classe…')} variant="detail" />
      </>
    );
  }

  if (result) {
    const { value, className } = result;
    return (
      <>
        <PageHeader title={t('Déclarer une classe vide')} back={back} />
        <SectionCard contentGap={2}>
          {className && (
            <Typography component="h2" variant="h5">
              {className}
            </Typography>
          )}
          <Alert severity={value.outcome === 'ALREADY_ASSIGNED' || value.outcome === 'SUPPORT' ? 'info' : 'success'} role="status">
            {outcomeMessage(value, className)}
          </Alert>
          {value.doubleAssignment && (
            <Alert severity="warning">
              {t('Vous aviez déjà une affectation en cours : l’admin est alertée et réassignera l’une des deux.')}
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {value.coverage && (
              <Button component={RouterLink} to={`/gardes/${value.coverage.id}`} variant="contained">
                {t('Voir l’affectation')}
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<QrCode size={icon.sm} aria-hidden="true" />}
              onClick={() => {
                again();
                setScanning(true);
              }}
            >
              {t('Scanner une autre classe')}
            </Button>
            <Button onClick={again}>{t('Déclarer une autre classe')}</Button>
          </Box>
        </SectionCard>
        {scanner}
      </>
    );
  }

  const message = declare.error instanceof ApiError ? declare.error.message : declare.error ? t('Déclaration impossible. Réessayez.') : null;
  // Le refus s'affiche à côté du choix utilisé : au-dessus du scan, ou dans le formulaire (013).
  const scanError = source === 'scan' ? message : null;
  const error = source === 'form' ? message : null;
  return (
    <>
      <PageHeader
        title={t('Déclarer une classe vide')}
        description={t('Choisissez la classe sans enseignant, puis déclarez-la : l’affectation est à votre nom et l’admin est prévenue tout de suite.')}
        back={back}
      />
      <SectionCard contentGap={1.5}>
        {scanError && (
          <Alert severity="error" role="alert">
            {scanError}
          </Alert>
        )}
        <Box>
          <Button
            variant="contained"
            size="large"
            startIcon={<QrCode size={icon.md} aria-hidden="true" />}
            onClick={() => {
              declare.reset();
              setScanning(true);
            }}
            sx={{ minHeight: 56 }}
          >
            {t('Scanner le QR code de la classe')}
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {t('La déclaration part dès que le QR code de la porte est lu.')}
        </Typography>
      </SectionCard>
      <Divider sx={{ my: 2.5 }}>{t('ou')}</Divider>
      <SectionCard component="form" noValidate onSubmit={submit} contentGap={2.5}>
        <FormControl component="fieldset" error={Boolean(classError)} required>
          <FormLabel component="legend" id={ids.classes}>
            {t('Classe')}
          </FormLabel>
          <RadioGroup
            aria-labelledby={ids.classes}
            aria-describedby={classError ? ids.error : undefined}
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            {classes.data.map((c) => (
              <FormControlLabel
                key={c.id}
                value={c.id}
                control={<Radio />}
                label={[c.name, c.room, c.floor?.name].filter(Boolean).join(' · ')}
                sx={{ minHeight: 44 }}
              />
            ))}
          </RadioGroup>
          {classError && <FormHelperText id={ids.error}>{classError}</FormHelperText>}
        </FormControl>

        <TextField
          select
          id="classe-vide-enseignant"
          label={t('Enseignant (facultatif)')}
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          helperText={t('Laissez « Non précisé » si vous ne savez pas : cela ne bloque pas la déclaration.')}
        >
          <MenuItem value={NO_TEACHER}>{t('Non précisé')}</MenuItem>
          {(teachers.data ?? []).map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.displayName}
            </MenuItem>
          ))}
        </TextField>

        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        <Box>
          <Button
            type="submit"
            variant="contained"
            size="large"
            loading={declare.isPending}
            startIcon={<DoorOpen size={icon.md} aria-hidden="true" />}
            sx={{ minHeight: 48 }}
          >
            {t('Déclarer la classe vide')}
          </Button>
        </Box>
      </SectionCard>
      {scanner}
    </>
  );
}
