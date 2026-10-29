import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ComplianceBar, ComplianceGauge, ComplianceStatus, NoData, SampleSizeBadge } from '../../src/features/admin/DelayMetrics';
import { COMPLIANCE_TARGET, complianceLevel, isLowSample, LOW_SAMPLE_THRESHOLD } from '../../src/features/admin/delayThresholds';

/** Onglet « Délais » : seuils de présentation et petits composants (cas limites). */

describe('Seuils de l’onglet Délais', () => {
  it('classe le taux par rapport à l’objectif : atteint, proche (10 points), sous l’objectif', () => {
    expect(COMPLIANCE_TARGET).toBe(0.8);
    expect(complianceLevel(1)).toBe('met');
    expect(complianceLevel(0.8)).toBe('met');
    expect(complianceLevel(0.75)).toBe('near');
    expect(complianceLevel(0.7)).toBe('near');
    expect(complianceLevel(0.69)).toBe('below');
    expect(complianceLevel(0)).toBe('below');
    expect(complianceLevel(null)).toBeNull();
  });

  it('signale un échantillon faible entre 1 et le seuil exclu, jamais à 0', () => {
    expect(LOW_SAMPLE_THRESHOLD).toBe(5);
    expect(isLowSample(0)).toBe(false);
    expect(isLowSample(1)).toBe(true);
    expect(isLowSample(4)).toBe(true);
    expect(isLowSample(5)).toBe(false);
  });
});

describe('Anneau de respect des délais', () => {
  it('100 % : objectif atteint, nommé pour les lecteurs d’écran', () => {
    render(<ComplianceGauge rate={1} />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Respect des délais : 100 %, objectif 80 %, objectif atteint');
  });

  it('0 % : sous l’objectif, aucun arc de progression', () => {
    const { container } = render(<ComplianceGauge rate={0} />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Respect des délais : 0 %, objectif 80 %, sous l’objectif');
    expect(container.querySelector('circle.bar')).toBeNull();
  });

  it('sans demande évaluée (null) : dit qu’il n’y a rien à mesurer', () => {
    render(<ComplianceGauge rate={null} />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Respect des délais : aucune demande évaluée');
  });

  it('le niveau est écrit avec une icône, pas porté par la seule couleur ; rien sans donnée', () => {
    const { rerender, container } = render(<ComplianceStatus rate={0.75} />);
    expect(container).toHaveTextContent('Proche de l’objectif (objectif 80 %)');
    rerender(<ComplianceStatus rate={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('barre du tableau nommée par son pourcentage', () => {
    render(<ComplianceBar rate={1} />);
    expect(screen.getByRole('img')).toHaveAccessibleName('100 % des demandes dans les délais');
  });
});

describe('Taille de l’échantillon', () => {
  it('n = 0 : badge neutre, sans avertissement', () => {
    render(<SampleSizeBadge count={0} />);
    expect(screen.getByText('n = 0')).toBeVisible();
    expect(screen.queryByText(/échantillon faible/)).not.toBeInTheDocument();
  });

  it('n = 1 : avertissement écrit et infobulle au focus clavier', async () => {
    render(<SampleSizeBadge count={1} />);
    expect(screen.getByText(/n = 1/)).toHaveTextContent('n = 1, échantillon faible');
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('1 demande mesurée. Échantillon faible : interpréter avec prudence.');
  });

  it('n = 5 : au seuil, plus d’avertissement', () => {
    render(<SampleSizeBadge count={5} />);
    expect(screen.getByText('n = 5')).toBeVisible();
    expect(screen.queryByText(/échantillon faible/)).not.toBeInTheDocument();
  });
});

describe('Absence de donnée', () => {
  it('« Aucune donnée » au lieu d’un tiret, explication au survol', async () => {
    render(<NoData />);
    await userEvent.hover(screen.getByText('Aucune donnée'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Aucune demande mesurable sur la période.');
  });
});
