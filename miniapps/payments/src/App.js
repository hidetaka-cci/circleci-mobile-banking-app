import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
const P1_UNUSED = 'p1-a1';

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
