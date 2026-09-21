import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {AdminCustomer, AdminOrderSummary, getAdminCustomer, getAdminCustomerOrders} from '../services/adminManagementApi';

type Props = {accessToken: string; customerId: string; onBack: () => void; onOrder: (id: string) => void};
export default function AdminCustomerDetailScreen({accessToken, customerId, onBack, onOrder}: Props) {
  const [customer, setCustomer] = useState<AdminCustomer | null>(null);
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [person, history] = await Promise.all([getAdminCustomer(accessToken, customerId), getAdminCustomerOrders(accessToken, customerId)]);
      setCustomer(person); setOrders(history);
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Customer unavailable.');}
    finally {setLoading(false);}
  }, [accessToken, customerId]);
  useEffect(() => {load();}, [load]);
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Customers</Text></TouchableOpacity>
    <Text style={styles.title}>Customer profile</Text>
    {loading ? <ActivityIndicator accessibilityLabel="Loading customer profile" /> : null}
    {error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><TouchableOpacity onPress={() => {load();}}><Text style={styles.link}>Retry customer</Text></TouchableOpacity></> : null}
    {!loading && !error && customer ? <>
      <View style={styles.card}><Text>Name: {customer.profiles?.full_name || 'Not provided'}</Text>
        <Text>Contact: {customer.profiles?.phone || 'Not provided'}</Text>
        <Text>Account: {customer.profiles?.is_active ? 'Active' : 'Disabled'}</Text></View>
      <Text style={styles.heading}>Saved addresses</Text>
      {customer.customer_addresses?.length ? customer.customer_addresses.map(address => <Text key={address.id}>
        {address.label || 'Address'}{address.is_default ? ' · Default' : ''}: {address.address_line1}, {address.city || ''} {address.postal_code || ''}
      </Text>) : <Text>No saved addresses.</Text>}
      <Text style={styles.heading}>Order history</Text>
      {orders.length ? orders.map(order => <TouchableOpacity key={order.id} accessibilityRole="button" style={styles.card} onPress={() => onOrder(order.id)}>
        <Text style={styles.bold}>{order.order_number}</Text><Text>{order.current_status.replace(/_/g, ' ')} · ₹{Number(order.total_amount).toFixed(2)}</Text>
      </TouchableOpacity>) : <Text>No orders yet.</Text>}
    </> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#fff'}, content: {padding: 20, gap: 12}, title: {fontSize: 25, fontWeight: '700'}, heading: {fontSize: 19, fontWeight: '700'}, card: {padding: 14, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, gap: 5}, bold: {fontWeight: '700'}, link: {fontWeight: '700'}, error: {color: '#a11'}});
