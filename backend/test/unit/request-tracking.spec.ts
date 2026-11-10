import { ALL_STATUSES } from '../../src/requests/domain/request-state-machine';
import { TRACKING_GROUPS, trackingGroupOf } from '../../src/requests/domain/tracking';

/**
 * 016 — « Suivi de mes demandes » : chaque statut d'une demande envoyée appartient à exactement un
 * groupe (en attente, validées / traitées, archives) ; le brouillon n'en a aucun.
 */
describe('Groupes de suivi des demandes', () => {
  it('les trois groupes, dans l’ordre de l’accueil', () => {
    expect(Object.keys(TRACKING_GROUPS)).toEqual(['pending', 'handled', 'archived']);
  });

  it('en attente : validation attendue ou traitement en cours', () => {
    expect(TRACKING_GROUPS.pending).toEqual(['PENDING_ADMIN_VALIDATION', 'SENT', 'IN_PROGRESS', 'TO_CORRECT', 'PENDING_FINAL_VALIDATION']);
  });

  it('validées / traitées : acceptées ou terminées', () => {
    expect(TRACKING_GROUPS.handled).toEqual(['ACCEPTED', 'DONE']);
  });

  it('archives : clôturées, refusées ou annulées', () => {
    expect(TRACKING_GROUPS.archived).toEqual(['CLOSED', 'REJECTED', 'CANCELLED']);
  });

  it.each(ALL_STATUSES.filter((s) => s !== 'DRAFT'))('%s appartient à un seul groupe', (status) => {
    const groups = Object.values(TRACKING_GROUPS).filter((statuses) => (statuses as readonly string[]).includes(status));
    expect(groups).toHaveLength(1);
    expect(trackingGroupOf(status)).not.toBeNull();
  });

  it('un brouillon n’appartient à aucun groupe', () => {
    expect(trackingGroupOf('DRAFT')).toBeNull();
  });
});
