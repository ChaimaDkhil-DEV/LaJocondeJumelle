import { CoverageActionsService } from '../../src/coverage/coverage-actions.service';
import { qrKeyFrom } from '../../src/coverage/domain/qr-token';

/** Les QR imprimés ont leur propre secret : SESSION_SECRET peut être remplacé sans les réimprimer. */
it('la clé des QR codes vient du secret des QR, pas de celui des sessions', () => {
  const unused = {} as never;
  const config = { qrSecret: 'secret-des-qr', sessionSecret: 'secret-des-sessions' } as never;
  const service = new CoverageActionsService(unused, unused, unused, unused, unused, unused, config);
  expect(service.key).toEqual(qrKeyFrom('secret-des-qr'));
});
