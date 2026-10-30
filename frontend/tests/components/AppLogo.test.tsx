import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createAppTheme } from '../../src/app/theme';
import { AppLogo, LOGO_SRC } from '../../src/components/AppLogo';

/** Logo de l'application : fichier public/logo.png, décoratif, repli sur la vignette si le fichier manque. */

function renderLogo(mode: 'light' | 'dark' = 'light', height?: number) {
  const { container } = render(
    <ThemeProvider theme={createAppTheme(mode)}>
      <AppLogo height={height} />
    </ThemeProvider>,
  );
  return container;
}

describe('AppLogo', () => {
  it('affiche /logo.png, décoratif (le nom est écrit à côté), à la hauteur demandée', () => {
    const container = renderLogo('light', 48);
    const img = container.querySelector('img')!;
    expect(LOGO_SRC).toBe('/logo.png');
    expect(img).toHaveAttribute('src', '/logo.png');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveStyle({ height: '48px', objectFit: 'contain' });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('logo absent ou illisible : la vignette d’origine le remplace', () => {
    const container = renderLogo();
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    const fallback = screen.getByTestId('app-logo-fallback');
    expect(fallback).toHaveAttribute('aria-hidden', 'true');
    expect(fallback.querySelector('svg')).not.toBeNull();
  });

  it('mode sombre : posé sur une pastille claire pour rester lisible ; mode clair : sans fond', () => {
    expect(renderLogo('dark').querySelector('img')).toHaveStyle({ backgroundColor: '#ffffff' });
    expect(renderLogo('light').querySelector('img')).not.toHaveStyle({ backgroundColor: '#ffffff' });
  });
});
