import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../src/App';

test('renders Payments title', () => {
  const { getByText } = render(<App />);
  expect(getByText('Welcome to Payments')).toBeTruthy();
});

test('renders Send money button', () => {
  const { getByText } = render(<App />);
  expect(getByText('Send money')).toBeTruthy();
});
