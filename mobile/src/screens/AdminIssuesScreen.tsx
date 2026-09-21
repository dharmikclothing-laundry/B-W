import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity} from 'react-native';
import {AdminIssueQueue, listAdminIssues} from '../services/adminIssuesApi';

type Props = {accessToken: string; onBack: () => void; onOrder: (orderId: string) => void};

export default function AdminIssuesScreen({accessToken, onBack, onOrder}: Props) {
  const [queue, setQueue] = useState<AdminIssueQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {setQueue(await listAdminIssues(accessToken));}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Issues unavailable.');}
    finally {setLoading(false);}
  }, [accessToken]);
  useEffect(() => {load();}, [load]);
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={loading && !!queue} onRefresh={load} />}>
    <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Admin dashboard</Text></TouchableOpacity>
    <Text style={styles.title}>Customer issues</Text>
    <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.link}>Refresh issues</Text></TouchableOpacity>
    {loading ? <ActivityIndicator accessibilityLabel="Loading customer issues" /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {error ? <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.link}>Retry issues</Text></TouchableOpacity> : null}
    {queue ? <>
      <Text style={styles.heading}>Claims</Text>
      {queue.claims.length ? queue.claims.map(claim => <TouchableOpacity key={claim.id} style={styles.card} accessibilityRole="button" onPress={() => onOrder(claim.order_id)}>
        <Text>{claim.claim_type.replace(/_/g, ' ')} · {claim.status.replace(/_/g, ' ')}</Text><Text>{claim.description}</Text>
      </TouchableOpacity>) : <Text>No claims.</Text>}
      <Text style={styles.heading}>Refunds</Text>
      {queue.refunds.length ? queue.refunds.map(refund => <TouchableOpacity key={refund.id} style={styles.card} accessibilityRole="button"
        onPress={() => refund.payment_orders?.order_id && onOrder(refund.payment_orders.order_id)}>
        <Text>₹{Number(refund.amount).toFixed(2)} · {refund.status.replace(/_/g, ' ')}</Text><Text>{refund.reason}</Text>
      </TouchableOpacity>) : <Text>No refunds.</Text>}
      <Text style={styles.heading}>Cancellations</Text>
      {queue.cancellations.length ? queue.cancellations.map(order => <TouchableOpacity key={order.id} style={styles.card} accessibilityRole="button" onPress={() => onOrder(order.id)}>
        <Text>{order.order_number} · cancelled</Text>
      </TouchableOpacity>) : <Text>No cancellations.</Text>}
    </> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#fff'}, content: {padding: 20, gap: 12}, title: {fontSize: 25, fontWeight: '700'}, heading: {fontSize: 19, fontWeight: '700'}, card: {padding: 14, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, gap: 5}, link: {fontWeight: '700'}, error: {color: '#a11'}});
