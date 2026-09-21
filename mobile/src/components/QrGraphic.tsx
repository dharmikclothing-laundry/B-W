import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import QRCode from 'qrcode';

type Props = {payload: string; accessibilityLabel?: string};

export default function QrGraphic({payload, accessibilityLabel = 'Order handoff QR code'}: Props) {
  const modules = useMemo(() => QRCode.create(payload, {errorCorrectionLevel: 'M'}).modules, [payload]);
  return <View accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={styles.quiet}>
    {Array.from({length: modules.size}, (_, row) => <View key={row} style={styles.row}>
      {Array.from({length: modules.size}, (__, col) => <View key={col} style={[styles.cell, Boolean(modules.get(row, col)) && styles.dark]} />)}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({quiet: {width: 190, height: 190, padding: 11, backgroundColor: '#fff'}, row: {flex: 1, flexDirection: 'row'}, cell: {flex: 1, backgroundColor: '#fff'}, dark: {backgroundColor: '#111'}});
