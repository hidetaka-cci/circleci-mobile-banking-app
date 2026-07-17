import { maxRefundPercentage } from '../src/lib/limits';

describe('maxRefundPercentage', () => {
  test('returns 100 at the configured policy limit', () => {
    expect(maxRefundPercentage()).toBe(100);
  });
});
