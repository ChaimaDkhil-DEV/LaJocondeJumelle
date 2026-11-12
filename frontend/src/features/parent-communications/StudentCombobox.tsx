import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useRef } from 'react';
import { radius } from '../../design/tokens';
import { t } from '../../i18n';
import { fullName, type StudentRef } from './api';

/**
 * Élève concerné : recherche à la frappe parmi les élèves de l'enseignant, et raccourcis vers les
 * derniers élèves contactés (« Récents »).
 */
export function StudentCombobox({
  students,
  recent,
  value,
  onChange,
  focusOnOpen,
}: {
  students: StudentRef[];
  recent: StudentRef[];
  value: StudentRef | null;
  onChange: (student: StudentRef | null) => void;
  focusOnOpen?: boolean;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  // Focus à l'arrivée (et quand le panneau devient visible, la largeur d'écran étant connue après coup).
  useEffect(() => {
    if (focusOnOpen) input.current?.focus();
  }, [focusOnOpen]);
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Autocomplete
        options={students}
        value={value}
        onChange={(_e, student) => onChange(student)}
        getOptionLabel={(s) => `${fullName(s)} — ${s.class.name}`}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText={t('Aucun élève')}
        openOnFocus={false}
        renderInput={(params) => (
          <TextField
            {...params}
            label={t('Élève')}
            placeholder={t('Rechercher un élève')}
            inputRef={input}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: `${radius.round}px`, minHeight: 48 },
            }}
          />
        )}
      />
      {recent.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
          <Typography variant="body2" color="text.secondary" component="span">
            {t('Récents :')}
          </Typography>
          {recent.map((s) => {
            const selected = value?.id === s.id;
            return (
              <Chip
                key={s.id}
                label={fullName(s)}
                color={selected ? 'primary' : 'default'}
                variant={selected ? 'filled' : 'outlined'}
                aria-pressed={selected}
                onClick={() => onChange(s)}
                sx={{ minHeight: 44, borderRadius: `${radius.round}px` }}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}
