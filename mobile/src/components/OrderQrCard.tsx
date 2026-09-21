import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {getCustomerOrderQr} from '../services/qrApi';
import QrGraphic from './QrGraphic';

type Props = {accessToken: string; orderId: string};
export default function OrderQrCard({accessToken, orderId}: Props) {
  const [payload, setPayload] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => {setLoading(true); setError(''); try {setPayload((await getCustomerOrderQr(accessToken, orderId)).payload);} catch (cause) {setError(cause instanceof Error ? cause.message : 'Order QR is unavailable.');} finally {setLoading(false);}}, [accessToken, orderId]);
  useEffect(() => {load();}, [load]);
  return <View style={styles.card}><Text style={styles.title}>Order QR</Text><Text style={styles.detail}>Show this code to the assigned B&W team member during handoff.</Text>{loading ? <ActivityIndicator accessibilityLabel="Loading order QR" /> : null}{payload ? <QrGraphic payload={payload} /> : null}{error ? <View style={styles.errorRow}><Text style={styles.error}>{error}</Text><TouchableOpacity onPress={load}><Text style={styles.retry}>Retry</Text></TouchableOpacity></View> : null}<Text style={styles.safety}>This code identifies your order. Scanning and receipt confirmation remain restricted to authorized staff.</Text></View>;
}
const styles = StyleSheet.create({card: {padding: 18, borderWidth: 1, borderColor: '#E2DED6', borderRadius: 16, backgroundColor: '#fff', marginBottom: 18, alignItems: 'center'}, title: {fontSize: 18, fontWeight: '800'}, detail: {color: '#656159', textAlign: 'center', marginTop: 5, marginBottom: 14}, safety: {fontSize: 11, lineHeight: 16, color: '#777', textAlign: 'center', marginTop: 12}, errorRow: {alignItems: 'center', gap: 7}, error: {color: '#9A241E'}, retry: {fontWeight: '800'}});
