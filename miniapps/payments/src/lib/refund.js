import { formatUSD } from './currency';

export function calculateRefund(payment, reason) {
  if (reason === 'full') return payment.totalCents;
  if (reason === 'partial') return Math.floor(payment.totalCents / 2);
  if (reason === 'fee_only') return payment.feeCents;
  throw new Error('unknown reason');
}

export function refundSummary(payment, reason) {
  const refundCents = calculateRefund(payment, reason);
  return `${payment.card} — refund ${formatUSD(refundCents)}`;
}
