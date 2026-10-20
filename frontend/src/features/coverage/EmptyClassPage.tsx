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
import { DoorOpen } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { SectionCard } from '../../components/SectionCard';
import { icon } from '../../design/tokens';
import { useCoverageClasses, useCoverageTeachers, useDeclareEmptyClass } from './api';
import type { EmptyClassResult } from './types';

/** « Non précisé » : l'enseignant n'est jamais exigé (FR-015a). */
const NO_TEACHER = 'none';

/** Message selon l'issue de la déclaration (contracts/rest-api.md, FR-015d à FR-015g). */
function outcomeMessage(result: EmptyClassResult, className: string): string {
  const responsible = result.assignedTo?.displayName ?? 'Un surveillant';
  switch (result.outcome) {
    case 'CREATED':
      return `Classe ${className} déclarée vide. L’affectation est à votre nom, en cours : l’admin est prévenue. Restez avec les élèves.`;
    case 'ATTACHED':
      return 'La demande de l’enseignant pour cette classe vous est affectée, en cours. L’admin est prévenue.';
    case 'SUPPORT':
      return `Cette classe est déjà prise en charge par ${responsible}. Vous êtes en renfort jusqu’à la décision de l’admin.`;
    case 'ALREADY_ASSIGNED':
      return `${responsible} est déjà assigné(e) à cette classe. L’admin est prévenue et décidera ; vous pouvez reprendre votre tour.`;
    case 'MERGE_PROPOSED':
      return `Classe ${className} déclarée vide : l’affectation est à votre nom, en cours. Une demande existe déjà pour cette classe : l’admin vérifiera s’il s’agit du même cas.`;
  }
}

/**
 * Déclarer une classe vide pendant le tour (US2, FR-015) : en deux gestes, la classe puis
 * « Déclarer ». L'enseignant est facultatif ; ouverte depuis le QR de la classe, la classe est
 * présélectionnée et le QR transmis comme preuve de présence (R10).
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
  const back = { to: '/gardes?onglet=mes-affectations', label: 'Mes affectations' };

  if (classes.isPending) return <LoadingState label="Chargement des classes" variant="detail" />;
  if (classes.error) return <ErrorState message="Impossible de charger les classes." actionLabel="Réessayer" onAction={() => void classes.refetch()} />;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!classId) {
      setClassError('Choisissez la classe.');
      return;
    }
    setClassError(null);
    const className = classes.data?.find((c) => c.id === classId)?.name ?? '';
    declare.mutate(
      { clientId: clientId.current, classId, teacherId: teacherId === NO_TEACHER ? null : teacherId, ...(qrToken ? { qrToken } : {}) },
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

  if (result) {
    const { value, className } = result;
    return (
      <>
        <PageHeader title="Déclarer une classe vide" back={back} />
        <SectionCard contentGap={2}>
          <Alert severity={value.outcome === 'ALREADY_ASSIGNED' || value.outcome === 'SUPPORT' ? 'info' : 'success'} role="status">
            {outcomeMessage(value, className)}
          </Alert>
          {value.doubleAssignment && (
            <Alert severity="warning">
              Vous aviez déjà une affectation en cours : l’admin est alertée et réassignera l’une des deux.
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {value.coverage && (
              <Button component={RouterLink} to={`/gardes/${value.coverage.id}`} variant="contained">
                Voir l’affectation
              </Button>
            )}
            <Button onClick={again}>Déclarer une autre classe</Button>
          </Box>
        </SectionCard>
      </>
    );
  }

  const error = declare.error instanceof ApiError ? declare.error.message : declare.error ? 'Déclaration impossible. Réessayez.' : null;
  return (
    <>
      <PageHeader
        title="Déclarer une classe vide"
        description="Choisissez la classe sans enseignant, puis déclarez-la : l’affectation est à votre nom et l’admin est prévenue tout de suite."
        back={back}
      />
      <SectionCard component="form" noValidate onSubmit={submit} contentGap={2.5}>
        <FormControl component="fieldset" error={Boolean(classError)} required>
          <FormLabel component="legend" id={ids.classes}>
            Classe
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
          label="Enseignant (facultatif)"
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          helperText="Laissez « Non précisé » si vous ne savez pas : cela ne bloque pas la déclaration."
        >
          <MenuItem value={NO_TEACHER}>Non précisé</MenuItem>
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
            Déclarer la classe vide
          </Button>
        </Box>
      </SectionCard>
    </>
  );
}
