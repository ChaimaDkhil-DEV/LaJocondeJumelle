import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageSwitcher } from '../../src/components/LanguageSwitcher';

describe('LanguageSwitcher', () => {
  beforeEach(() => localStorage.clear());

  it('offers both languages and shows the current one', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('group', { name: 'Langue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('saves the chosen language and reloads', async () => {
    const reload = vi.fn();
    render(<LanguageSwitcher onReload={reload} />);
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(localStorage.getItem('ljj-language')).toBe('en');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does nothing when the current language is clicked', async () => {
    const reload = vi.fn();
    render(<LanguageSwitcher onReload={reload} />);
    await userEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(reload).not.toHaveBeenCalled();
  });
});
