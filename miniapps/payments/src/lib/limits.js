// Payment refund policy limits.
//
// maxRefundPercentage: reads PAYMENT_REFUND_LIMIT_BP (basis points).
// 10000 bp = 100 % (full refund allowed).
export function maxRefundPercentage() {
  const basisPoints = Number(process.env.PAYMENT_REFUND_LIMIT_BP);
  return basisPoints / 100;
}
