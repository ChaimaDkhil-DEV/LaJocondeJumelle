/** Numéro tunisien : 8 chiffres, avec ou sans l'indicatif du pays (+216 ou 00216). Espaces, points et tirets tolérés. */
const TUNISIAN_PHONE = /^(?:(?:\+|00)216)?\d{8}$/;

/** Même règle que le serveur (backend/src/common/tunisian-phone.ts), qui range le numéro au format « +216 XX XXX XXX ». */
export function isTunisianPhone(value: string): boolean {
  return TUNISIAN_PHONE.test(value.replace(/[ .-]/g, ''));
}
