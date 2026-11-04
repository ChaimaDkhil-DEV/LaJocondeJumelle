import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { language, setLanguage, t, type Language } from '../i18n';

const OPTIONS: { value: Language; short: string; name: string }[] = [
  { value: 'fr', short: 'FR', name: 'Français' },
  { value: 'en', short: 'EN', name: 'English' },
];

interface LanguageSwitcherProps {
  /** Replaces the page reload in tests. */
  onReload?: () => void;
}

/** True when a text field holds typed content that a reload would discard. */
function hasUnsavedInput(): boolean {
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'textarea, input:not([type="search"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
  );
  return Array.from(fields).some((field) => field.value.trim() !== '' && field.defaultValue !== field.value);
}

/** Language choice. Each name stays in its own language so it can be recognized from either. */
export function LanguageSwitcher({ onReload }: LanguageSwitcherProps) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={language()}
      aria-label={t('Langue')}
      onChange={(_, next: Language | null) => {
        if (!next) return;
        if (!onReload && hasUnsavedInput() && !window.confirm(t('Changer de langue recharge la page : le texte saisi sera perdu. Continuer ?'))) return;
        setLanguage(next, onReload);
      }}
    >
      {OPTIONS.map(({ value, short, name }) => (
        <ToggleButton key={value} value={value} aria-label={name} lang={value} sx={{ px: 1.25, py: 0.25 }}>
          {short}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
