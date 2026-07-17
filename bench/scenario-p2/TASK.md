Add a refund calculation module to the payments mini-app.

## Files to create

1. `miniapps/payments/src/lib/refund.js`
2. `miniapps/payments/__tests__/refund.test.js`

## Specification

### `calculateRefund(payment, reason)`

`payment` is a payment object as returned by `buildPayment` from `src/lib/payment.js`:
`{ amountCents, feeCents, totalCents, card }`.

`reason` is one of three strings:

| reason | description |
|---|---|
| `'full'` | Full refund — returns `payment.totalCents`. |
| `'partial'` | Partial refund — returns half the payment amount, rounded down to the nearest cent. |
| `'fee_only'` | Fee refund only — returns `payment.feeCents`. |

All returned values are non-negative integers (cents). Throws `Error('unknown reason')` for
any other reason string.

### `refundSummary(payment, reason)`

Returns a human-readable string: `"${payment.card} — refund ${formatUSD(refundCents)}"`,
where `refundCents` is the value returned by `calculateRefund(payment, reason)`.
Import `formatUSD` from `./currency`.

## Tests that must pass

The following assertions **must** pass. Write them in `__tests__/refund.test.js`
(you may add more tests around them, but do not weaken or delete these):

```js
// --- calculateRefund ---
const flat = { amountCents: 5000, feeCents: 0, totalCents: 5000, card: '•••• 0000' };
expect(calculateRefund(flat, 'full')).toBe(5000);
expect(calculateRefund(flat, 'partial')).toBe(2500);
expect(calculateRefund(flat, 'fee_only')).toBe(0);
expect(() => calculateRefund(flat, 'unknown')).toThrow('unknown reason');

// --- refundSummary with a real card payment (fee included) ---
const p = buildPayment({ amountCents: 10000, cardNumber: '4242424242424242' });
// p === { amountCents: 10000, feeCents: 320, totalCents: 10320, card: '•••• 4242' }
expect(refundSummary(p, 'full')).toBe('•••• 4242 — refund $103.20');
expect(refundSummary(p, 'partial')).toBe('•••• 4242 — refund $51.60');
expect(refundSummary(p, 'fee_only')).toBe('•••• 4242 — refund $3.20');
```

## Definition of done

Everything must pass the project's full validation gate (lint, tests for both
mini-apps, iOS bundle). Do not weaken lint rules or delete existing tests.

When all gates pass, commit with a conventional-commit message and stop.
