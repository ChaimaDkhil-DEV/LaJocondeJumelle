import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { Priority } from '../../api/types';
import { PRIORITY_LABELS, PRIORITY_STYLE } from '../../components/PriorityBadge';
import { font, icon } from '../../design/tokens';
import type { Circuit, DeadlineRule } from './api';
import { formatMinutes } from './labels';

export const PRIORITIES: readonly Priority[] = ['NORMAL', 'MEDIUM', 'HIGH', 'URGENT'];

type Field = 'validationMinutes' | 'takeoverMinutes' | 'completionMinutes';

/** Saisie : chaînes (vide = pas de délai). */
export type DeadlineDraft = Record<Priority, Record<Field, string>>;
export type DeadlineErrors = Partial<Record<`${Priority}.${Field}`, string>>;

const FIELD_LABELS: Record<Field, string> = {
  validationMinutes: 'Validation administrative (minutes)',
  takeoverMinutes: 'Prise en charge (minutes)',
  completionMinutes: 'Réalisation (minutes)',
};

const MAX_MINUTES = 525_600;
const INVALID = 'Au moins 1 minute, ou vide pour aucun délai.';

export function toDraft(rules: DeadlineRule[]): DeadlineDraft {
  const draft = {} as DeadlineDraft;
  for (const priority of PRIORITIES) {
    const rule = rules.find((r) => r.priority === priority);
    draft[priority] = {
      validationMinutes: rule?.validationMinutes?.toString() ?? '',
      takeoverMinutes: rule?.takeoverMinutes?.toString() ?? '',
      completionMinutes: rule?.completionMinutes?.toString() ?? '',
    };
  }
  return draft;
}

function parse(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const minutes = Number(trimmed);
  return minutes >= 1 && minutes <= MAX_MINUTES ? minutes : undefined;
}

/** Vérifie la saisie ; renvoie les règles prêtes à envoyer, ou les erreurs par champ. */
export function fromDraft(draft: DeadlineDraft, circuit: Circuit): { rules: DeadlineRule[]; errors: DeadlineErrors } {
  const errors: DeadlineErrors = {};
  const rules = PRIORITIES.map((priority) => {
    const read = (field: Field): number | null => {
      if (field === 'validationMinutes' && circuit === 'A_DIRECT') return null;
      const parsed = parse(draft[priority][field]);
      if (parsed === undefined) {
        errors[`${priority}.${field}`] = INVALID;
        return null;
      }
      return parsed;
    };
    return {
      priority,
      validationMinutes: read('validationMinutes'),
      takeoverMinutes: read('takeoverMinutes'),
      completionMinutes: read('completionMinutes'),
    };
  });
  return { rules, errors };
}

interface DeadlineRulesTableProps {
  circuit: Circuit;
  value: DeadlineDraft;
  errors: DeadlineErrors;
  onChange: (value: DeadlineDraft) => void;
}

/** Délais par priorité (4 priorités × 2 ou 3 délais), présentés en groupes pour rester lisibles à 320 px. */
export function DeadlineRulesTable({ circuit, value, errors, onChange }: DeadlineRulesTableProps) {
  const fields: Field[] = circuit === 'B_ADMIN_VALIDATION' ? ['validationMinutes', 'takeoverMinutes', 'completionMinutes'] : ['takeoverMinutes', 'completionMinutes'];

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {PRIORITIES.map((priority) => {
        const Icon = PRIORITY_STYLE[priority].icon;
        return (
          <Box
            component="fieldset"
            key={priority}
            sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, m: 0, p: 2, minWidth: 0 }}
          >
            <Typography component="legend" variant="body2" sx={{ px: 0.5, fontWeight: font.medium, display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              <Icon size={icon.sm} aria-hidden="true" />
              {PRIORITY_LABELS[priority]}
            </Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: `repeat(${fields.length}, minmax(0, 1fr))` } }}>
              {fields.map((field) => {
                const raw = value[priority][field];
                const error = errors[`${priority}.${field}`];
                const parsed = parse(raw);
                return (
                  <TextField
                    key={field}
                    id={`delai-${priority}-${field}`}
                    label={FIELD_LABELS[field]}
                    value={raw}
                    inputMode="numeric"
                    onChange={(e) => onChange({ ...value, [priority]: { ...value[priority], [field]: e.target.value } })}
                    error={Boolean(error)}
                    helperText={error ?? (parsed === null ? 'Aucun délai' : parsed !== undefined ? formatMinutes(parsed) : ' ')}
                    slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*' } }}
                  />
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
