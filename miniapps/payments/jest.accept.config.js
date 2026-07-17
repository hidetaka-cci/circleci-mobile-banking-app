// Used only for running held-out acceptance tests after an agent session.
// Run: PAYMENT_REFUND_LIMIT_BP=10000 npx jest --config jest.accept.config.js
module.exports = {
  preset: './node_modules/react-native/jest-preset.js',
  roots: ['<rootDir>/../../bench/scenario-p2/held-out'],
  testMatch: ['**/*.test.js'],
};
