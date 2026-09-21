import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type LoadingViewProps = {
  message?: string;
};

export default function LoadingView({
  message = 'Loading...',
}: LoadingViewProps) {
  return (
    <View
      style={
        styles.container
      }>
      <ActivityIndicator
        size="large"
        color="#111111"
      />

      <Text
        style={
          styles.message
        }>
        {message}
      </Text>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      minHeight: 220,
      alignItems: 'center',
      justifyContent:
        'center',
      paddingHorizontal: 24,
    },

    message: {
      marginTop: 12,
      fontSize: 14,
      color: '#666666',
      textAlign: 'center',
    },
  });