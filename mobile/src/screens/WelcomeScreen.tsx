import React from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type WelcomeScreenProps = {
  onGetStarted: () => void;
};

export default function WelcomeScreen({
  onGetStarted,
}: WelcomeScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.content}>
        <Text style={styles.logo}>B&W</Text>

        <Text style={styles.title}>
          Bright & White
        </Text>

        <Text style={styles.subtitle}>
          Laundry & Dry Cleaning
        </Text>

        <Text style={styles.description}>
          Easy pickup. Professional cleaning. Delivered to your doorstep.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={onGetStarted}>
          <Text style={styles.buttonText}>
            Get Started
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>
        Clean clothes. Simple life.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },

  logo: {
    fontSize: 42,
    fontWeight: '800',
    marginBottom: 18,
  },

  title: {
    fontSize: 34,
    fontWeight: '700',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 20,
    fontWeight: '500',
    marginBottom: 25,
  },

  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    color: '#555555',
    marginBottom: 40,
  },

  button: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#111111',
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },

  footer: {
    textAlign: 'center',
    paddingBottom: 20,
    fontSize: 13,
    color: '#666666',
  },
});