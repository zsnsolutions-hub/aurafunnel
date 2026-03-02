import { describe, it, expect } from 'vitest';
import { formatMoneyUSD } from '../formatMoney';

describe('formatMoneyUSD', () => {
  it('formats zero cents', () => {
    expect(formatMoneyUSD(0)).toBe('$0.00');
  });

  it('formats positive cents', () => {
    expect(formatMoneyUSD(1999)).toBe('$19.99');
  });

  it('formats negative cents', () => {
    expect(formatMoneyUSD(-500)).toBe('-$5.00');
  });

  it('formats large amounts with commas', () => {
    expect(formatMoneyUSD(1_234_567)).toBe('$12,345.67');
  });
});
