import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';

type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export default function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  style,
}: PrimaryButtonProps) {
  const isDisabled =
    disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.button,
        isDisabled &&
          styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator
          color="#FFFFFF"
        />
      ) : (
        <Text
          style={
            styles.buttonText
          }>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles =
  StyleSheet.create({
    button: {
      width: '100%',
      minHeight: 52,
      borderRadius: 13,
      backgroundColor:
        '#111111',
      alignItems: 'center',
      justifyContent:
        'center',
      paddingHorizontal: 18,
      paddingVertical: 14,
    },

    disabled: {
      opacity: 0.4,
    },

    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      textAlign: 'center',
    },
  });