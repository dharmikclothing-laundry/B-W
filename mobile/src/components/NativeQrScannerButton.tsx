import React, {useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {scanOrderQr} from '../services/nativeQrScanner';

type Props = {onScanned: (payload: string) => void | Promise<void>; label?: string};

export default function NativeQrScannerButton({onScanned, label = 'Scan order QR'}: Props) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const scan = async () => {
    if (scanning) return;
    setScanning(true); setError('');
    try {await onScanned(await scanOrderQr());}
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'QR scanner is unavailable.';
      if (!/cancel/i.test(message)) setError(message);
    } finally {setScanning(false);}
  };
  return <View style={styles.wrap}>
    <TouchableOpacity accessibilityRole="button" disabled={scanning} style={styles.button} onPress={scan}>
      {scanning ? <ActivityIndicator color="#fff" accessibilityLabel="Opening QR scanner" /> : <Text style={styles.text}>▣ {label}</Text>}
    </TouchableOpacity>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({wrap: {gap: 7}, button: {minHeight: 48, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18}, text: {color: '#fff', fontWeight: '800', fontSize: 16}, error: {color: '#9A241E'}});
