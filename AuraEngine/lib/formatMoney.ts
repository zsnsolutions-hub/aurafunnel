/**
 * Canonical USD formatter. All money is stored as integer cents;
 * call this at the UI boundary to produce display strings.
 */
export function formatMoneyUSD(amountCents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}
