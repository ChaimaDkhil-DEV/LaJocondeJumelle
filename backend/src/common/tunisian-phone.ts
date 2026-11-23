/** Numéro tunisien : 8 chiffres, avec ou sans l'indicatif du pays (+216 ou 00216). Espaces, points et tirets tolérés. */
const LOCAL_NUMBER = /^(?:(?:\+|00)216)?(\d{8})$/;

/** Forme rangée en base : « +216 20 123 456 ». */
export const TUNISIAN_PHONE_FORMAT = /^\+216 \d{2} \d{3} \d{3}$/;

export const TUNISIAN_PHONE_MESSAGE =
  'Numéro de téléphone tunisien invalide : 8 chiffres, avec ou sans « +216 » (par exemple 20 123 456).';

/**
 * Transformation de class-transformer : un numéro tunisien valide est rangé au format « +216 XX XXX XXX ».
 * Toute autre valeur est rendue sans changement (espaces réduits), pour que la validation la refuse avec son message.
 */
export function normalizeTunisianPhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim().replace(/\s+/g, ' ');
  const digits = LOCAL_NUMBER.exec(text.replace(/[ .-]/g, ''))?.[1];
  return digits ? `+216 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}` : text;
}
