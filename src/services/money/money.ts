// Money is integer cents in US dollars (spec 3.7.4; REQ-03-09). No floating-point money anywhere.

/** 600 -> "6.00", 5 -> "0.05": the PayPal amount value, exactly two decimals, by integer arithmetic only. */
export function centsToDecimalString(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`Not a cents amount: ${cents}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
