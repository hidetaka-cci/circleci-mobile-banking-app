import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const App = () => {
  const handleSend = () => {};

  return (
    <View style={styles.container}>
      <Text style={styles.welcome}>Welcome back</Text>
      <Text style={styles.title}>Welcome to Payments</Text>
      <Text style={styles.subtitle}>Manage and send money with ease</Text>
      <TouchableOpacity style={styles.button} onPress={handleSend}>
        <Text style={styles.buttonText}>Send money</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  welcome: { fontSize: 14, color: '#666' },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 16, color: '#444', marginTop: 8 },
  button: { marginTop: 24, backgroundColor: '#007AFF', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default App;
