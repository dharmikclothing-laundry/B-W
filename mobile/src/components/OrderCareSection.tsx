import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import type {CustomerOrder} from '../types/order';
import {cancelOrder, canCancelOrder} from '../services/ordersApi';
import {
  canRaiseClaim, chooseClaimPhoto, CLAIM_TYPES, createClaim,
  getOrderClaims, uploadClaimPhoto,
  type ClaimPhoto, type ClaimType, type CustomerClaim,
} from '../services/claimsApi';
import {getPaymentSummary, requestRefund, type PaymentSummary} from '../services/paymentsApi';

type Props = {
  accessToken: string;
  order: CustomerOrder;
  refreshKey: number;
  onActionComplete: () => Promise<void>;
};

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function label(value: string) {
  return value.replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase());
}

export default function OrderCareSection({accessToken, order, refreshKey, onActionComplete}: Props) {
  const [claims, setClaims] = useState<CustomerClaim[]>([]);
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showClaim, setShowClaim] = useState(false);
  const [claimType, setClaimType] = useState<ClaimType>('damage');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<ClaimPhoto | null>(null);
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const postDelivery = Boolean(order.delivered_at) ||
    ['delivered', 'claim_period_active', 'completed'].includes(order.current_status);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [claimResult, paymentResult] = await Promise.allSettled([
      postDelivery ? getOrderClaims(accessToken, order.id) : Promise.resolve([]),
      getPaymentSummary(accessToken, order.id),
    ]);
    const failures: string[] = [];
    if (claimResult.status === 'fulfilled') setClaims(claimResult.value);
    else failures.push(`Claims: ${message(claimResult.reason)}`);
    if (paymentResult.status === 'fulfilled') setPayment(paymentResult.value);
    else failures.push(`Payment: ${message(paymentResult.reason)}`);
    setLoadError(failures.length ? failures.join('\n') : null);
    setLoading(false);
  }, [accessToken, order.id, postDelivery]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setActionError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(done);
      await onActionComplete();
      await reload();
    } catch (error) {
      setActionError(message(error));
    } finally {
      setBusy(false);
    }
  };

  const submitCancel = () => run(async () => {
    await cancelOrder(accessToken, order.id, cancelReason);
    setShowCancel(false);
    setCancelReason('');
  }, 'Order cancelled.');

  const submitClaim = () => run(async () => {
    const created = await createClaim(accessToken, order.id, claimType, description);
    setShowClaim(false);
    setDescription('');
    if (photo) {
      try {
        await uploadClaimPhoto(accessToken, created.id, photo);
        setPhoto(null);
      } catch (error) {
        setPhoto(null);
        setActionError(`Claim submitted, but the photograph was not attached: ${message(error)}`);
      }
    }
  }, 'Claim submitted.');

  const addPhoto = async (claimId: string, source: 'library' | 'camera' = 'library') => {
    try {
      const selected = await chooseClaimPhoto(source);
      if (!selected) {
        if (source === 'camera') setActionError('Camera did not return a photo. Tap Use Photo after taking the picture.');
        return;
      }
      await run(() => uploadClaimPhoto(accessToken, claimId, selected), 'Photograph added to claim.');
    } catch (error) { setActionError(message(error)); }
  };

  const submitRefund = () => run(async () => {
    if (!payment?.payment) throw new Error('Payment is unavailable.');
    await requestRefund(accessToken, payment.payment.paymentOrderId, Number(refundAmount), refundReason);
    setShowRefund(false);
    setRefundAmount('');
    setRefundReason('');
  }, 'Refund request submitted.');

  const claimWindow = canRaiseClaim(order.current_status, order.claim_deadline_at);
  const mayRefund = payment?.refundEligibility?.eligible === true;

  return <View style={styles.wrap}>
    <Text style={styles.heading}>Order Help</Text>
    {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
    {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}

    {canCancelOrder(order.current_status) ? <View style={styles.card}>
      <Text style={styles.title}>Cancel Order</Text>
      {!showCancel ? <TouchableOpacity accessibilityRole="button" onPress={() => setShowCancel(true)}><Text style={styles.link}>Cancel Order</Text></TouchableOpacity> : <>
        <TextInput accessibilityLabel="Cancellation reason" placeholder="Reason for cancellation" value={cancelReason} onChangeText={setCancelReason} multiline style={styles.input} />
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={submitCancel}><Text style={styles.link}>Confirm cancellation</Text></TouchableOpacity>
      </>}
    </View> : null}

    {postDelivery ? <View style={styles.card}>
      <Text style={styles.title}>Claims</Text>
      {loading ? <Text style={styles.info}>Loading claims...</Text> : null}
      {!loading && claims.length === 0 ? <Text style={styles.info}>No claims for this order.</Text> : null}
      {claims.map(claim => <View key={claim.id} style={styles.row}>
        <Text style={styles.value}>{label(claim.claim_type)} · {label(claim.status)}</Text>
        <Text style={styles.info}>{claim.description}</Text>
        <Text style={styles.info}>{new Date(claim.created_at).toLocaleDateString('en-IN')}</Text>
        <Text style={styles.info}>Photos: {claim.customer_claim_photos?.length ?? 0}</Text>
        {['submitted', 'under_review'].includes(claim.status) ? <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => addPhoto(claim.id)}><Text style={styles.link}>Add claim photo</Text></TouchableOpacity> : null}
        {['submitted', 'under_review'].includes(claim.status) ? <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => addPhoto(claim.id, 'camera')}><Text style={styles.link}>Take claim photo</Text></TouchableOpacity> : null}
      </View>)}
      {claimWindow ? (!showClaim ? <TouchableOpacity accessibilityRole="button" onPress={() => setShowClaim(true)}><Text style={styles.link}>Raise Claim</Text></TouchableOpacity> : <>
        <Text style={styles.info}>Claim reason</Text>
        <View style={styles.choices}>{CLAIM_TYPES.map(option => <TouchableOpacity key={option.value} accessibilityRole="button" accessibilityState={{selected: claimType === option.value}} onPress={() => setClaimType(option.value)} style={[styles.choice, claimType === option.value && styles.chosen]}><Text>{option.label}</Text></TouchableOpacity>)}</View>
        <TextInput accessibilityLabel="Claim description" placeholder="Describe the issue" value={description} onChangeText={setDescription} multiline style={styles.input} />
        <TouchableOpacity accessibilityRole="button" onPress={async () => {try {const selected = await chooseClaimPhoto(); if (selected) setPhoto(selected);} catch (error) {setActionError(message(error));}}}><Text style={styles.link}>{photo ? `Photo: ${photo.name}` : 'Choose claim photo (optional)'}</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={async () => {try {const selected = await chooseClaimPhoto('camera'); if (selected) setPhoto(selected);} catch (error) {setActionError(message(error));}}}><Text style={styles.link}>Take claim photo (optional)</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={submitClaim}><Text style={styles.link}>Submit Claim</Text></TouchableOpacity>
      </>) : <Text style={styles.info}>The claim period has ended.</Text>}
    </View> : null}

    <View style={styles.card}>
      <Text style={styles.title}>Payment</Text>
      {loading ? <Text style={styles.info}>Loading payment status...</Text> : null}
      {!loading && !payment?.payment ? <Text style={styles.info}>No online payment for this order.</Text> : null}
      {payment?.payment ? <Text style={styles.value}>Payment: {label(payment.payment.status)}</Text> : null}
      {payment && payment.refunds.length === 0 && mayRefund ? <Text style={styles.info}>No refund requests.</Text> : null}
      {payment?.refunds.map(refund => <View key={refund.refundRequestId} style={styles.row}>
        <Text style={styles.value}>Refund: {label(refund.status)} · ₹{refund.amount.toFixed(2)}</Text>
        <Text style={styles.info}>{refund.reason}</Text>
      </View>)}
      {mayRefund ? (!showRefund ? <TouchableOpacity accessibilityRole="button" onPress={() => setShowRefund(true)}><Text style={styles.link}>Request Refund</Text></TouchableOpacity> : <>
        <TextInput accessibilityLabel="Refund amount" placeholder="Amount in rupees" keyboardType="decimal-pad" value={refundAmount} onChangeText={setRefundAmount} style={styles.input} />
        <TextInput accessibilityLabel="Refund reason" placeholder="Reason for refund" value={refundReason} onChangeText={setRefundReason} multiline style={styles.input} />
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={submitRefund}><Text style={styles.link}>Submit Refund Request</Text></TouchableOpacity>
      </>) : null}
    </View>
    {loadError ? <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text> : null}
    {loadError ? <TouchableOpacity accessibilityRole="button" onPress={() => reload()}><Text style={styles.link}>Retry order help</Text></TouchableOpacity> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: {marginBottom: 20}, heading: {fontSize: 16, fontWeight: '800', marginBottom: 10},
  card: {borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 16, padding: 16, marginBottom: 12},
  title: {fontSize: 14, fontWeight: '700', marginBottom: 8},
  row: {borderTopWidth: 1, borderTopColor: '#EEEEEE', paddingTop: 10, marginTop: 10},
  info: {fontSize: 12, color: '#666666', marginTop: 5, lineHeight: 18},
  value: {fontSize: 13, fontWeight: '700'}, link: {fontSize: 13, fontWeight: '700', color: '#111111', marginTop: 12},
  input: {borderWidth: 1, borderColor: '#CCCCCC', borderRadius: 10, padding: 10, marginTop: 10, minHeight: 42},
  choices: {flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8},
  choice: {borderWidth: 1, borderColor: '#CCCCCC', borderRadius: 8, padding: 7},
  chosen: {backgroundColor: '#F3F0EA', borderColor: '#111111'},
  error: {color: '#B42318', fontSize: 12, marginBottom: 8},
  success: {color: '#217A45', fontSize: 12, marginBottom: 8},
});
