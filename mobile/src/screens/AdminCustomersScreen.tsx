import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {AdminCustomer, getAdminCustomers, lookupAdminQr} from '../services/adminManagementApi';
import NativeQrScannerButton from '../components/NativeQrScannerButton';

type Props = {accessToken: string; onBack: () => void; onCustomer: (id: string) => void; onOrder: (id: string) => void};
export default function AdminCustomersScreen({accessToken, onBack, onCustomer, onOrder}: Props) {
  const [search, setSearch] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [findingQr, setFindingQr] = useState(false);
  const [qrError, setQrError] = useState('');
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (term = '') => {
    setLoading(true); setError('');
    try {setCustomers(await getAdminCustomers(accessToken, term));}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Customers unavailable.');}
    finally {setLoading(false);}
  }, [accessToken]);
  useEffect(() => {load();}, [load]);
  const lookup = async (scannedCode?: string) => {
    if (findingQr) return;
    setFindingQr(true); setQrError('');
    try {
      const payload = scannedCode ?? qrCode;
      if (scannedCode) setQrCode(scannedCode);
      const result = await lookupAdminQr(accessToken, payload);
      if (!result.orderId) throw new Error('No order was found for that handoff code.');
      onOrder(result.orderId);
    } catch (cause) {setQrError(cause instanceof Error ? cause.message : 'Unable to look up QR.');}
    finally {setFindingQr(false);}
  };
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Admin dashboard</Text></TouchableOpacity>
    <Text style={styles.eyebrow}>ORDER MANAGEMENT</Text><Text style={styles.title}>Customers & orders</Text>
    <View style={styles.lookupCard}><Text style={styles.sectionTitle}>Find an order</Text><Text style={styles.muted}>Scan an order QR for immediate lookup, or enter the code manually.</Text>
    <NativeQrScannerButton label="Scan order QR" onScanned={lookup} />
    <TextInput accessibilityLabel="Handoff QR code" placeholder="BW1 handoff code" autoCapitalize="none" value={qrCode} onChangeText={setQrCode} style={styles.input} />
    <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} disabled={findingQr} onPress={() => {lookup();}}><Text style={styles.secondaryText}>{findingQr ? 'Looking up…' : 'Look up order'}</Text></TouchableOpacity>
    {qrError ? <Text accessibilityRole="alert" style={styles.error}>{qrError}</Text> : null}
    </View><Text style={styles.sectionTitle}>Customer directory</Text>
    <TextInput accessibilityLabel="Search customers" placeholder="Name or phone" value={search} onChangeText={setSearch} style={styles.input} />
    <TouchableOpacity accessibilityRole="button" onPress={() => {load(search);}}><Text style={styles.link}>Search</Text></TouchableOpacity>
    {loading ? <ActivityIndicator accessibilityLabel="Loading customers" /> : null}
    {error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><TouchableOpacity onPress={() => {load(search);}}><Text style={styles.link}>Retry customers</Text></TouchableOpacity></> : null}
    {!loading && !error && !customers.length ? <Text>No customers found.</Text> : null}
    {!loading && !error ? customers.map(customer =>
      <TouchableOpacity key={customer.id} accessibilityRole="button" style={styles.card} onPress={() => onCustomer(customer.id)}>
        <Text style={styles.bold}>{customer.profiles?.full_name || 'Customer'}</Text>
        <Text>{customer.profiles?.phone || 'No phone on profile'}</Text>
      </TouchableOpacity>) : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#F7F6F2'}, content: {padding: 18, gap: 14, paddingBottom: 36}, eyebrow: {fontSize: 11, letterSpacing: 1.4, fontWeight: '800', color: '#67635B'}, title: {fontSize: 30, fontWeight: '900'}, sectionTitle: {fontSize: 19, fontWeight: '900'}, lookupCard: {backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2DED6', borderRadius: 17, padding: 15, gap: 11}, muted: {color: '#67635B'}, link: {fontWeight: '900'}, input: {borderWidth: 1, borderColor: '#CFCAC0', backgroundColor: '#fff', borderRadius: 11, padding: 12}, secondaryButton: {minHeight: 46, borderWidth: 1, borderColor: '#151515', borderRadius: 13, justifyContent: 'center', alignItems: 'center'}, secondaryText: {fontWeight: '900'}, card: {padding: 15, borderWidth: 1, borderColor: '#E2DED6', backgroundColor: '#fff', borderRadius: 15}, bold: {fontWeight: '900'}, error: {color: '#9A241E'}});
