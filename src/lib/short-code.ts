// Confusable characters 0, O, 1, I and L are deliberately excluded.
export const SHORT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Cryptographically secure random integer, rejecting values to avoid modulo bias. */
function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
    throw new RangeError("maxExclusive must be an integer between 1 and 2^32");
  }
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0]!;
  } while (value >= limit);
  return value % maxExclusive;
}

export function generateShortCode(
  length = 6,
  randomInt: (maxExclusive: number) => number = secureRandomInt,
): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeShortCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isShortCode(input: string): boolean {
  const code = normalizeShortCode(input);
  if (code.length < 4 || code.length > 12) return false;
  for (const char of code) {
    if (!SHORT_CODE_ALPHABET.includes(char)) return false;
  }
  return true;
}
