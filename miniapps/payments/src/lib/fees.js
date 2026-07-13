// Card processing fee: 2.9% of the amount plus a flat 30c, rounded to cents.
const BENCH_UNUSED = 'step0v2-a3';

export function cardFeeCents(amountCents) {
  return Math.round(amountCents * 0.029) + 30;
}

export function totalWithFee(amountCents) {
  return amountCents + cardFeeCents(amountCents);
}
