import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {AdminIssueDetail, approveAdminRefund, decideAdminClaim, getAdminIssueOrder, rejectAdminRefund, requestAdminRefund} from '../services/adminIssuesApi';
import {deviceReachableUploadUrl} from '../services/claimsApi';

type Props = {accessToken: string; orderId: string; onBack: () => void; onOrder: () => void};
const money = (value: number | string) => `₹${Number(value).toFixed(2)}`;

export default function AdminIssueDetailScreen({accessToken, orderId, onBack, onOrder}: Props) {
  const [detail, setDetail] = useState<AdminIssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {setDetail(await getAdminIssueOrder(accessToken, orderId));}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Issue details unavailable.');}
    finally {setLoading(false);}
  }, [accessToken, orderId]);
  useEffect(() => {load();}, [load]);
  const act = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {await action(); await load(); setSuccess(message); setNotes(''); setAmount('');}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Action failed.');}
    finally {setBusy(false);}
  };
  const decision = (claimId: string, status: 'under_review' | 'approved' | 'rejected' | 'resolved') =>
    act(() => decideAdminClaim(accessToken, orderId, claimId, status, notes), `Claim ${status.replace(/_/g, ' ')}.`);
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Customer issues</Text></TouchableOpacity>
    <Text style={styles.title}>Claims and refunds</Text>
    <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.link}>Refresh issue details</Text></TouchableOpacity>
    {loading ? <ActivityIndicator accessibilityLabel="Loading issue details" /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {error ? <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.link}>Retry issue details</Text></TouchableOpacity> : null}
    {success ? <Text accessibilityRole="alert">{success}</Text> : null}
    {detail ? <>
      <Text>{detail.order.order_number} · {detail.order.current_status.replace(/_/g, ' ')} · {money(detail.order.total_amount)}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onOrder}><Text style={styles.link}>Open full order and cancellation controls</Text></TouchableOpacity>
      <TextInput accessibilityLabel="Admin decision notes" placeholder="Required decision reason or notes" multiline value={notes} onChangeText={setNotes} style={styles.input} />
      <Text style={styles.heading}>Claims</Text>
      {detail.claims.length ? detail.claims.map(claim => <View key={claim.id} style={styles.card}>
        <Text style={styles.bold}>{claim.claim_type.replace(/_/g, ' ')} · {claim.status.replace(/_/g, ' ')}</Text>
        <Text>{claim.description}</Text><Text>Decision: {claim.resolution_notes || 'Pending'}</Text>
        <Text>Evidence: {claim.customer_claim_photos?.length ?? 0} photo(s)</Text>
        {claim.customer_claim_photos?.map(photo => <Image key={photo.id} accessibilityLabel="Claim evidence photo" source={{uri: deviceReachableUploadUrl(photo.signedUrl)}} style={styles.photo} />)}
        {claim.status === 'submitted' ? <>
          <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => decision(claim.id, 'under_review')}><Text style={styles.link}>Start review</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => decision(claim.id, 'rejected')}><Text style={styles.link}>Reject claim</Text></TouchableOpacity>
        </> : null}
        {claim.status === 'under_review' ? <>
          <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => decision(claim.id, 'approved')}><Text style={styles.link}>Approve claim</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => decision(claim.id, 'rejected')}><Text style={styles.link}>Reject claim</Text></TouchableOpacity>
        </> : null}
        {claim.status === 'approved' ? <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => decision(claim.id, 'resolved')}><Text style={styles.link}>Resolve claim</Text></TouchableOpacity> : null}
      </View>) : <Text>No claims for this order.</Text>}
      <Text style={styles.heading}>Payments and refunds</Text>
      {detail.payments.length ? detail.payments.map(payment => <View key={payment.id} style={styles.card}>
        <Text style={styles.bold}>{payment.provider} · {payment.status} · {money(payment.amount)}</Text>
        <Text>Available to refund: {money(payment.refundableAmount)}</Text>
        {payment.refund_requests.length ? payment.refund_requests.map(refund => <View key={refund.id} style={styles.card}>
          <Text>Refund {money(refund.amount)} · {refund.status.replace(/_/g, ' ')}</Text>
          <Text>Reason: {refund.reason}</Text><Text>Decision: {refund.decision_notes || 'Pending'}</Text>
          {['requested','under_review'].includes(refund.status) ? <>
            <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => act(() => approveAdminRefund(accessToken, orderId, refund.id, notes), 'Refund approved and processed.')}><Text style={styles.link}>Approve refund</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => act(() => rejectAdminRefund(accessToken, orderId, refund.id, notes), 'Refund rejected.')}><Text style={styles.link}>Reject refund</Text></TouchableOpacity>
          </> : null}
        </View>) : <Text>No refund requests.</Text>}
        {payment.provider === 'mock' && payment.refundableAmount > 0 ? <>
          <TextInput accessibilityLabel={`Refund amount for ${payment.id}`} placeholder="Refund amount in rupees" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} style={styles.input} />
          <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => act(() => requestAdminRefund(accessToken, orderId, payment.id, Number(amount), notes), 'Refund requested.')}><Text style={styles.link}>Request refund</Text></TouchableOpacity>
        </> : null}
      </View>) : <Text>No payment record.</Text>}
      <Text style={styles.heading}>Cancellation history</Text>
      {detail.cancellationHistory.length ? detail.cancellationHistory.map(item => <Text key={item.id}>{new Date(item.created_at).toLocaleString('en-IN')} · {item.reason || 'No reason recorded'}</Text>) : <Text>No cancellation recorded.</Text>}
      <Text style={styles.heading}>Admin decision audit</Text>
      {detail.audit.length ? detail.audit.map(item => <Text key={item.id}>{item.action.replace(/_/g, ' ')} · {item.notes}</Text>) : <Text>No decisions recorded.</Text>}
    </> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#fff'}, content: {padding: 20, gap: 12}, title: {fontSize: 25, fontWeight: '700'}, heading: {fontSize: 19, fontWeight: '700'}, card: {padding: 14, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, gap: 8}, input: {borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 12}, link: {fontWeight: '700'}, bold: {fontWeight: '700'}, error: {color: '#a11'}, photo: {width: 220, height: 220, borderRadius: 8}});
