import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
// step0-scenario-a: intentional ESLint violation for token measurement
const unusedVariable = 'this_triggers_no_unused_vars_error';
const anotherUnused = 42;

const App = () => (
  <View style={styles.container}>
    <Text style={styles.welcome}>Welcome back</Text>
    <Text style={styles.title}>Welcome to Payments</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  welcome: { fontSize: 14, color: '#666' },
  title: { fontSize: 24, fontWeight: 'bold' },
});

export default App;
