import { buildPayment } from '../src/lib/payment';
import { calculateRefund, refundSummary } from '../src/lib/refund';

describe('calculateRefund', () => {
  const flat = { amountCents: 5000, feeCents: 0, totalCents: 5000, card: '•••• 0000' };

  test('full refund returns totalCents', () => {
    expect(calculateRefund(flat, 'full')).toBe(5000);
  });

  test('partial refund returns half of totalCents rounded down', () => {
    expect(calculateRefund(flat, 'partial')).toBe(2500);
  });

  test('fee_only refund returns feeCents', () => {
    expect(calculateRefund(flat, 'fee_only')).toBe(0);
  });

  test('throws for unknown reason', () => {
    expect(() => calculateRefund(flat, 'unknown')).toThrow('unknown reason');
  });
});

describe('refundSummary', () => {
  const p = buildPayment({ amountCents: 10000, cardNumber: '4242424242424242' });
  // p === { amountCents: 10000, feeCents: 320, totalCents: 10320, card: '•••• 4242' }

  test('full refund summary', () => {
    expect(refundSummary(p, 'full')).toBe('•••• 4242 — refund $103.20');
  });

  test('partial refund summary', () => {
    expect(refundSummary(p, 'partial')).toBe('•••• 4242 — refund $51.60');
  });

  test('fee_only refund summary', () => {
    expect(refundSummary(p, 'fee_only')).toBe('•••• 4242 — refund $3.20');
  });
});
