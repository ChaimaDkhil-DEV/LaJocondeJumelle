import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { LoadingState } from '../../src/components/LoadingState';
import { PriorityChip, PRIORITY_LABELS } from '../../src/components/PriorityChip';
import { StatusChip, STATUS_LABELS } from '../../src/components/StatusChip';

describe('StatusChip', () => {
  it('a un libellé français pour chacun des 11 statuts', () => {
    expect(STATUS_LABELS).toEqual({
      DRAFT: 'Brouillon',
      PENDING_ADMIN_VALIDATION: 'En attente de validation administrative',
      SENT: 'Envoyée',
      ACCEPTED: 'Acceptée',
      IN_PROGRESS: 'En cours',
      DONE: 'Terminée',
      PENDING_FINAL_VALIDATION: 'En attente de validation finale',
      TO_CORRECT: 'À corriger',
      CLOSED: 'Clôturée',
      REJECTED: 'Refusée',
      CANCELLED: 'Annulée',
    });
  });

  it('affiche le statut en texte (jamais par la couleur seule)', () => {
    render(<StatusChip status="TO_CORRECT" />);
    expect(screen.getByText('À corriger')).toBeVisible();
  });
});

describe('PriorityChip', () => {
  it('a un libellé français pour chaque priorité', () => {
    expect(PRIORITY_LABELS).toEqual({ NORMAL: 'Normale', MEDIUM: 'Moyenne', HIGH: 'Haute', URGENT: 'Urgente' });
  });

  it('signale « Urgente » par une icône et un texte', () => {
    render(<PriorityChip priority="URGENT" />);
    expect(screen.getByText('Urgente')).toBeVisible();
    expect(screen.getByTestId('priority-urgent-icon')).toBeInTheDocument();
  });

  it('n’affiche pas d’icône pour une priorité normale', () => {
    render(<PriorityChip priority="NORMAL" />);
    expect(screen.getByText('Normale')).toBeVisible();
    expect(screen.queryByTestId('priority-urgent-icon')).not.toBeInTheDocument();
  });
});

describe('États partagés', () => {
  it('LoadingState annonce le chargement aux lecteurs d’écran', () => {
    render(<LoadingState label="Chargement des demandes" />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des demandes');
  });

  it('EmptyState affiche un message', () => {
    render(<EmptyState title="Aucune demande" description="Vous n’avez reçu aucune demande." />);
    expect(screen.getByText('Aucune demande')).toBeVisible();
    expect(screen.getByText('Vous n’avez reçu aucune demande.')).toBeVisible();
  });

  it('ErrorState affiche le problème et propose une action corrective', async () => {
    const retry = vi.fn();
    render(<ErrorState message="Le serveur ne répond pas." actionLabel="Réessayer" onAction={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Le serveur ne répond pas.');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
