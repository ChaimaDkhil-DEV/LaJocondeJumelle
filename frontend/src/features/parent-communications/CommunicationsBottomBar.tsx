import Box from '@mui/material/Box';
import { ClipboardCheck, MessagesSquare, User, type LucideIcon } from 'lucide-react';
import { Link as RouterLink } from 'react-router';
import { font, fontSize, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';

export type BottomTab = 'messages' | 'valider' | 'profil';

interface Item {
  key: BottomTab;
  label: string;
  icon: LucideIcon;
  to: string;
  badge?: number;
  badgeLabel?: string;
}

/** Hauteur de la barre : la page réserve cet espace en bas pour que rien ne passe dessous. */
export const BOTTOM_BAR_HEIGHT = 64;

/**
 * Barre d'onglets fixe en bas de l'écran (mobile) : Messages · À valider · Profil. « À valider »
 * n'est proposé qu'à qui peut valider (`validerTo` défini). Masquée dès 900 px : les onglets de
 * la page prennent le relais.
 */
export function CommunicationsBottomBar({
  active,
  messagesTo,
  validerTo,
  unread,
  toValidate,
}: {
  active: BottomTab;
  messagesTo: string;
  /** Adresse de « À valider » ; absente quand l'utilisateur ne peut pas valider. */
  validerTo?: string;
  unread: number;
  toValidate: number;
}) {
  const items: Item[] = [
    {
      key: 'messages',
      label: t('Messages'),
      icon: MessagesSquare,
      to: messagesTo,
      badge: unread,
      badgeLabel: t('{count} non lus', { count: unread }),
    },
    ...(validerTo
      ? [
          {
            key: 'valider',
            label: t('À valider'),
            icon: ClipboardCheck,
            to: validerTo,
            badge: toValidate,
            badgeLabel: t('{count} à valider', { count: toValidate }),
          } satisfies Item,
        ]
      : []),
    { key: 'profil', label: t('Profil'), icon: User, to: '/profil' },
  ];
  return (
    <Box
      component="nav"
      aria-label={t('Navigation des messages')}
      sx={(theme) => {
        const tk = tokensOf(theme);
        return {
          position: 'fixed',
          insetInline: 0,
          bottom: 0,
          zIndex: theme.zIndex.appBar,
          display: 'flex',
          minHeight: BOTTOM_BAR_HEIGHT,
          pb: 'env(safe-area-inset-bottom)',
          bgcolor: tk.surface,
          borderTop: `1px solid ${tk.border}`,
          [theme.breakpoints.up('md')]: { display: 'none' },
        };
      }}
    >
      {items.map(({ key, label, icon: Icon, to, badge, badgeLabel }) => {
        const selected = key === active;
        return (
          <Box
            key={key}
            component={RouterLink}
            to={to}
            aria-current={selected ? 'page' : undefined}
            sx={(theme) => {
              const tk = tokensOf(theme);
              return {
                flex: 1,
                minHeight: 48,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.25,
                position: 'relative',
                textDecoration: 'none',
                fontSize: fontSize.xs,
                fontWeight: selected ? font.semibold : font.medium,
                color: selected ? tk.accent.main : tk.textSecondary,
                '&:focus-visible': { outline: `2px solid ${tk.focus}`, outlineOffset: -4 },
              };
            }}
          >
            <Icon size={22} strokeWidth={selected ? 2.25 : 1.75} aria-hidden="true" />
            <span>{label}</span>
            {badge ? (
              <Box
                component="span"
                aria-label={badgeLabel}
                sx={(theme) => ({
                  position: 'absolute',
                  top: 6,
                  left: 'calc(50% + 8px)',
                  minWidth: 18,
                  height: 18,
                  px: 0.5,
                  borderRadius: '9px',
                  bgcolor: tokensOf(theme).accent.main,
                  color: tokensOf(theme).accent.contrastText,
                  fontSize: 11,
                  fontWeight: font.semibold,
                  lineHeight: '18px',
                  textAlign: 'center',
                })}
              >
                {badge}
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
