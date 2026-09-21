import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {getOrder} from '../services/ordersApi';
import {getPaymentSummary} from '../services/paymentsApi';
import type {PaymentSummary} from '../services/paymentsApi';
import type {CustomerOrder} from '../types/order';
import {formatPaymentMethod, customerStatus} from '../utils/customerPresentation';
import {formatMoney} from '../utils/orderPricing';

type Props = {accessToken: string; orderId: string; onBack: () => void};
export default function ReceiptScreen({accessToken, orderId, onBack}: Props) {
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await getOrder(accessToken, orderId);
      setOrder(result);
      try {setPayment(await getPaymentSummary(accessToken, orderId));}
      catch {setPayment(null);}
    }
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Receipt unavailable.');}
    finally {setLoading(false);}
  }, [accessToken, orderId]);
  useEffect(() => {load();}, [load]);
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity onPress={onBack}><Text style={styles.link}>← Back</Text></TouchableOpacity>
    <Text style={styles.title}>Order receipt</Text>
    {loading ? <ActivityIndicator accessibilityLabel="Loading receipt" /> : null}
    {error ? <View><Text accessibilityRole="alert" style={styles.error}>{error}</Text><TouchableOpacity onPress={() => {load();}}><Text style={styles.link}>Retry</Text></TouchableOpacity></View> : null}
    {order ? <>
      <Text>Order {order.order_number}</Text><Text>{new Date(order.created_at).toLocaleString('en-IN')}</Text>
      <View style={styles.card}>
        {order.order_items?.map(item => <Text key={item.id}>{item.item_name} · {item.quantity} × ₹{formatMoney(Number(item.unit_price))} = ₹{formatMoney(Number(item.line_total))}</Text>)}
        <Text>Service subtotal: ₹{formatMoney(Number(order.subtotal))}</Text>
        <Text>Discount: −₹{formatMoney(Number(order.discount_amount))}</Text>
        <Text>Pickup & delivery: ₹{formatMoney(Number(order.pickup_delivery_charge))}</Text>
        <Text>Taxable amount: ₹{formatMoney(Number(order.taxable_amount))}</Text>
        <Text>GST ({Number(order.gst_rate)}%): ₹{formatMoney(Number(order.gst_amount))}</Text>
        <Text style={styles.total}>Total: ₹{formatMoney(Number(order.total_amount))}</Text>
      </View>
      <View style={styles.card}><Text>Payment method: {formatPaymentMethod(order.payment_method)}</Text>
        <Text>Payment status: {(payment?.payment?.status ? customerStatus(payment.payment.status) : null) ?? (order.payment_method === 'cash_on_delivery' ? 'Cash on delivery' : 'No payment record')}</Text>
        {payment?.refunds.map(refund => <Text key={refund.refundRequestId}>Refund ₹{formatMoney(refund.amount)} · {customerStatus(refund.status)}</Text>)}
      </View>
      <Text>This is an order receipt. A tax invoice is not available from the current billing system.</Text>
    </> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#fff'}, content: {padding: 20, gap: 12}, title: {fontSize: 24, fontWeight: '700'}, card: {borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, gap: 7}, total: {fontWeight: '700'}, link: {fontWeight: '700'}, error: {color: '#a11'}});
