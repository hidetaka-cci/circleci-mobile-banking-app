import { formatUSD } from './currency';

export function calculateRefund(payment, reason) {
  switch (reason) {
    case 'full':
      return payment.totalCents;
    case 'partial':
      return Math.floor(payment.totalCents / 2);
    case 'fee_only':
      return payment.feeCents;
    default:
      throw new Error('unknown reason');
  }
}

export function refundSummary(payment, reason) {
  const refundCents = calculateRefund(payment, reason);
  return `${payment.card} — refund ${formatUSD(refundCents)}`;
}
