import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../src/App';

test('renders Payments title', () => {
  const { getByText } = render(<App />);
  expect(getByText('Welcome to Payments')).toBeTruthy();
});

// step0-scenario-a-3: intentional unused import for token measurement
import { unusedImport } from 'react';
const deadCode = 'never_used_a3';

// step0-scenario-c: infra-like timeout (code is logically correct but times out)
test('infrastructure health check (times out in constrained env)', async () => {
  jest.setTimeout(50);
  await new Promise(resolve => setTimeout(resolve, 200));
});
