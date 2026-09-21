import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {AdminOrderDetail, canAdminCancelOrder, cancelAdminOrder, getAdminOrder} from '../services/adminManagementApi';
import QrGraphic from '../components/QrGraphic';
import {formatPaymentMethod} from '../utils/customerPresentation';

type Props = {accessToken: string; orderId: string; onBack: () => void};
const money = (value: number | string | null | undefined) => `₹${Number(value ?? 0).toFixed(2)}`;
export default function AdminOrderDetailScreen({accessToken, orderId, onBack}: Props) {
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [success, setSuccess] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {setDetail(await getAdminOrder(accessToken, orderId));}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Order unavailable.');}
    finally {setLoading(false);}
  }, [accessToken, orderId]);
  useEffect(() => {load();}, [load]);
  const cancel = async () => {
    if (!detail || cancelling || !canAdminCancelOrder(detail.order.current_status)) return;
    setCancelling(true); setError(''); setSuccess('');
    try {await cancelAdminOrder(accessToken, orderId, reason); setReason(''); await load(); setSuccess('Order cancelled.');}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Cancellation failed.');}
    finally {setCancelling(false);}
  };
  const order = detail?.order;
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Customer</Text></TouchableOpacity>
    <Text style={styles.title}>Order details</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => {load();}}><Text style={styles.link}>Refresh order</Text></TouchableOpacity>
    {loading ? <ActivityIndicator accessibilityLabel="Loading Admin order" /> : null}
    {error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><TouchableOpacity onPress={() => {load();}}><Text style={styles.link}>Retry order</Text></TouchableOpacity></> : null}
    {success ? <Text accessibilityRole="alert">{success}</Text> : null}
    {!loading && order ? <>
      <View style={styles.card}><Text style={styles.bold}>{order.order_number}</Text><Text>Status: {order.current_status.replace(/_/g, ' ')}</Text>
        <Text>Customer: {order.customers?.profiles?.full_name || 'Not provided'}</Text>
        <Text>Contact: {order.customers?.profiles?.phone || 'Not provided'}</Text>
        <Text>Pickup: {order.pickup_address?.address_line1 || 'No pickup address'}</Text>
        <Text>Delivery: {order.delivery_address?.address_line1 || 'No delivery address'}</Text>
        <Text>Pickup slot: {order.pickup_slot_label || 'Not scheduled'}</Text></View>
      <Text style={styles.heading}>Garments</Text>
      {order.order_items?.length ? order.order_items.map(item => <Text key={item.id}>{item.item_name} · {item.quantity} × {money(item.unit_price)} = {money(item.line_total)}{item.weight_kg ? ` · ${item.weight_kg} kg` : ''}</Text>) : <Text>No garments recorded.</Text>}
      <Text style={styles.heading}>Receipt and GST</Text>
      <View style={styles.card}><Text>Subtotal: {money(order.subtotal)}</Text><Text>Discount: {money(order.discount_amount)}</Text>
        <Text>Pickup and delivery: {money(order.pickup_delivery_charge)}</Text><Text>Taxable amount: {money(order.taxable_amount)}</Text>
        <Text>GST ({Number(order.gst_rate)}%): {money(order.gst_amount)}</Text><Text style={styles.bold}>Total: {money(order.total_amount)}</Text>
        <Text>Payment method: {formatPaymentMethod(order.payment_method)}</Text></View>
      <Text>This is an order receipt. A tax invoice is not available from the current billing system.</Text>
      <Text style={styles.heading}>Order timeline</Text>
      {order.order_status_history?.length ? [...order.order_status_history].sort((a, b) => a.created_at.localeCompare(b.created_at)).map(item => <Text key={item.id}>{item.to_status.replace(/_/g, ' ')} · {new Date(item.created_at).toLocaleString('en-IN')}{item.reason ? ` · ${item.reason}` : ''}</Text>) : <Text>No status updates yet.</Text>}
      <Text style={styles.heading}>QR handoff</Text>
      {order.order_qr_codes?.is_active ? <View style={styles.qrCard}><Text>Scan for secure order lookup and handoff history.</Text><QrGraphic payload={`BW1:${order.order_qr_codes.secure_token}`} accessibilityLabel="Admin order QR code" /></View> : <Text>No active handoff QR.</Text>}
      <Text style={styles.heading}>Payments and refunds</Text>
      {detail?.payments.length ? detail.payments.map(payment => <View key={payment.id} style={styles.card}><Text>{payment.provider} · {payment.status} · {money(payment.amount)}</Text>
        {payment.refund_requests?.length ? payment.refund_requests.map(refund => <Text key={refund.id}>Refund {money(refund.amount)} · {refund.status} · {refund.reason}</Text>) : <Text>No refund requests.</Text>}
      </View>) : <Text>No payment record.</Text>}
      <Text style={styles.heading}>Claims and cancellation</Text>
      {detail?.claims.length ? detail.claims.map(claim => <View key={claim.id} style={styles.card}><Text>{claim.claim_type.replace(/_/g, ' ')} · {claim.status}</Text><Text>{claim.description}</Text><Text>Photos: {claim.customer_claim_photos?.length ?? 0}</Text></View>) : <Text>No claims.</Text>}
      {canAdminCancelOrder(order.current_status) ? <View style={styles.card}>
        <Text>Admin cancellation requires a reason.</Text><TextInput accessibilityLabel="Admin cancellation reason" multiline placeholder="Reason for cancellation" value={reason} onChangeText={setReason} style={styles.input} />
        <TouchableOpacity accessibilityRole="button" disabled={cancelling} onPress={cancel}><Text style={styles.link}>{cancelling ? 'Cancelling…' : 'Cancel order'}</Text></TouchableOpacity>
      </View> : <Text>Cancellation is unavailable at this stage.</Text>}
    </> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#F7F6F2'}, content: {padding: 18, gap: 12, paddingBottom: 36}, title: {fontSize: 29, fontWeight: '900'}, heading: {fontSize: 19, fontWeight: '900'}, card: {padding: 15, borderWidth: 1, borderColor: '#E2DED6', backgroundColor: '#fff', borderRadius: 15, gap: 6}, qrCard: {alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2DED6', borderRadius: 17, padding: 15, gap: 9}, bold: {fontWeight: '900'}, link: {fontWeight: '900'}, input: {borderWidth: 1, borderColor: '#CFCAC0', backgroundColor: '#fff', borderRadius: 11, padding: 12}, error: {color: '#9A241E'}});
