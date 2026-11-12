import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { ClipboardCheck, Inbox, MessagesSquare, type LucideIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { font, icon, radius, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import { CountBadge, unreadLabel } from './ChatParts';
import type { Vue } from './communicationsView';

export const tabId = (vue: Vue) => `communications-tab-${vue}`;
export const PANEL_ID = 'communications-panel';

interface TabSpec {
  vue: Vue;
  label: string;
  icon: LucideIcon;
  count: number;
  countLabel: (count: number) => string;
}

/**
 * Onglets en pilules de la page « Communications » (administration) : Boîte de réception,
 * Conversations et, pour qui peut valider, À valider. Les compteurs sont ceux des données.
 */
export function CommunicationsTabs({
  vue,
  onChange,
  canValidate,
  unread,
  toValidate,
}: {
  vue: Vue;
  onChange: (vue: Vue) => void;
  canValidate: boolean;
  /** Messages non lus de la boîte de réception. */
  unread: number;
  /** Messages en attente que l'on peut décider. */
  toValidate: number;
}) {
  const tabs: TabSpec[] = [
    { vue: 'boite', label: t('Boîte de réception'), icon: Inbox, count: unread, countLabel: unreadLabel },
    { vue: 'conversations', label: t('Conversations'), icon: MessagesSquare, count: 0, countLabel: () => '' },
    ...(canValidate
      ? [
          {
            vue: 'valider',
            label: t('À valider'),
            icon: ClipboardCheck,
            count: toValidate,
            countLabel: (n: number) =>
              n > 1 ? t('{count} messages à valider', { count: n }) : t('{count} message à valider', { count: n }),
          } satisfies TabSpec,
        ]
      : []),
  ];

  // Flèches gauche/droite : on passe d'un onglet à l'autre (motif WAI-ARIA des onglets).
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.vue === vue);
    const next = tabs[(index + step + tabs.length) % tabs.length]!;
    onChange(next.vue);
    document.getElementById(tabId(next.vue))?.focus();
  }

  return (
    <Box
      role="tablist"
      aria-label={t('Vues des communications')}
      onKeyDown={onKeyDown}
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}
    >
      {tabs.map(({ vue: key, label, icon: Icon, count, countLabel }) => {
        const selected = key === vue;
        return (
          <ButtonBase
            key={key}
            id={tabId(key)}
            role="tab"
            aria-selected={selected}
            aria-controls={PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(key)}
            sx={(theme) => {
              const tk = tokensOf(theme);
              return {
                minHeight: 44,
                px: 2,
                gap: 1,
                borderRadius: `${radius.round}px`,
                border: `1.5px solid ${selected ? tk.accent.main : tk.border}`,
                bgcolor: selected ? tk.accent.soft : tk.surface,
                color: selected ? tk.accent.main : 'text.primary',
                fontWeight: selected ? font.semibold : font.medium,
                '&:hover': { bgcolor: selected ? tk.accent.soft : tk.surfaceMuted },
                '&.Mui-focusVisible': { outline: `2px solid ${tk.focus}`, outlineOffset: 2 },
              };
            }}
          >
            <Icon size={icon.md} strokeWidth={icon.stroke} aria-hidden="true" />
            {label}
            {count > 0 && <CountBadge count={count} label={countLabel(count)} />}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
