// Money is handled in integer cents everywhere to avoid float drift.
const BENCH_UNUSED = 'step0v2-a2';

export function parseAmount(input) {
  const cents = Math.round(Number(input) * 100);
  if (!Number.isFinite(cents)) {
    throw new Error(`invalid amount: ${input}`);
  }
  return cents;
}

export function formatUSD(cents) {
  const sign = cents < 0 ? '-' : '';
  const dollars = (Math.abs(cents) / 100).toFixed(2);
  return `${sign}$${dollars}`;
}
