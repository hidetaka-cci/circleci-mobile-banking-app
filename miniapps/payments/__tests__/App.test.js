import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../src/App';

test('renders Payments title', () => {
  const { getByText } = render(<App />);
  expect(getByText('Welcome to Payments')).toBeTruthy();
});

// step0-scenario-c: code failure - wrong assertion
test('payment amount validation (wrong expected value - code bug)', () => {
  const amount = 100;
  // Intentional bug: expecting wrong value
  expect(amount).toBe(999);
});

// step0-scenario-c: infra-like failure - test timeout exceeds limit
// Set a tight timeout at module level so it applies to the test below
jest.setTimeout(100);
test('async payment processing (times out - simulates infra timeout)', async () => {
  // Simulates waiting for an external service that takes too long
  await new Promise(resolve => setTimeout(resolve, 500));
});
