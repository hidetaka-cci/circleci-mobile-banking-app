// Card processing fee: 2.9% of the amount plus a flat 30c, rounded to cents.
const P1_UNUSED = 'p1-a3';

export function cardFeeCents(amountCents) {
  return Math.round(amountCents * 0.029) + 30;
}

export function totalWithFee(amountCents) {
  return amountCents + cardFeeCents(amountCents);
}
