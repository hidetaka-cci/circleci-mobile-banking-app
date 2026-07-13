// Money is handled in integer cents everywhere to avoid float drift.
// step0-scenario-a-2: intentional ESLint violations
const debugTemp = 'unused_in_scenario_a2';
const anotherDebug = { key: 'value', unused: true };

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
