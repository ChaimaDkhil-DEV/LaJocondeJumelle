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

/** Language choice. Each name stays in its own language so it can be recognized from either. */
export function LanguageSwitcher({ onReload }: LanguageSwitcherProps) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={language()}
      aria-label={t('Langue')}
      onChange={(_, next: Language | null) => {
        if (next) setLanguage(next, onReload);
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
