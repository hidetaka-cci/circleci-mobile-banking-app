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
