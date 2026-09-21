import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  IntakePreview,
  confirmFacilityReceipt,
  confirmFacilityReceiptByOrderId,
  previewFacilityReceipt,
  previewFacilityReceiptByOrderId,
} from '../services/facilityIntakeApi';
import NativeQrScannerButton from '../components/NativeQrScannerButton';

type Props = {
  accessToken: string;
  onBack: () => void;
  onReceived: () => void;
};

export default function FacilityIntakeScreen({
  accessToken,
  onBack,
  onReceived,
}: Props) {
  const [orderNumber, setOrderNumber] = useState('');
  const [receiptInput, setReceiptInput] = useState<{
    kind: 'qr' | 'order';
    value: string;
  } | null>(null);
  const [preview, setPreview] = useState<IntakePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const lock = useRef(false);
  const lookupQr = async (scannedCode: string) => {
    if (lock.current) return;
    const token = scannedCode.trim();
    setPreview(null);
    setError('');
    setSuccess('');
    if (
      !/^(?:BW1:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        token,
      )
    ) {
      setError('The scanned QR is not a valid B&W handoff code.');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      setPreview(await previewFacilityReceipt(accessToken, token));
      setReceiptInput({ kind: 'qr', value: token });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Order intake unavailable.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const lookupOrder = async () => {
    if (lock.current) return;
    const normalized = orderNumber.trim().toUpperCase();
    setPreview(null);
    setReceiptInput(null);
    setError('');
    setSuccess('');
    if (!/^BW-[A-Z0-9-]{6,40}$/.test(normalized)) {
      setError(
        'Enter the complete B&W order ID, for example BW-20260921-ABC12345.',
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      setPreview(
        await previewFacilityReceiptByOrderId(accessToken, normalized),
      );
      setReceiptInput({ kind: 'order', value: normalized });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Order intake unavailable.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (lock.current || !preview || !receiptInput) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const receipt =
        receiptInput.kind === 'qr'
          ? await confirmFacilityReceipt(accessToken, receiptInput.value)
          : await confirmFacilityReceiptByOrderId(
              accessToken,
              receiptInput.value,
            );
      if (!receipt.received || receipt.orderId !== preview.orderId)
        throw new Error(
          'Receipt could not be confirmed. Refresh and check the order.',
        );
      setPreview(null);
      setReceiptInput(null);
      setOrderNumber('');
      setSuccess(`Order ${preview.orderNumber} received at facility.`);
      onReceived();
    } catch (cause) {
      setPreview(null);
      setError(
        cause instanceof Error ? cause.message : 'Unable to confirm receipt.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity accessibilityRole="button" onPress={onBack}>
          <Text style={styles.link}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.eyebrow}>SECURE HANDOFF</Text>
        <Text style={styles.title}>Receive an order</Text>
        <Text style={styles.help}>
          Scan the driver’s handoff QR or enter the order ID shown on the Driver
          screen. Review the physical items before accepting the order.
        </Text>
        <NativeQrScannerButton
          label="Scan driver’s handoff QR"
          onScanned={lookupQr}
        />
        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.or}>OR ENTER ORDER ID</Text>
          <View style={styles.line} />
        </View>
        <TextInput
          accessibilityLabel="Order ID"
          autoCapitalize="characters"
          value={orderNumber}
          onChangeText={value => {
            setOrderNumber(value);
            setPreview(null);
            setReceiptInput(null);
            setError('');
          }}
          placeholder="BW-20260921-ABC12345"
          style={styles.input}
        />
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.secondaryButton}
          disabled={busy}
          onPress={() => {
            lookupOrder();
          }}
        >
          <Text style={styles.secondaryText}>Find order by ID</Text>
        </TouchableOpacity>
        {busy ? (
          <ActivityIndicator accessibilityLabel="Checking facility intake" />
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {success ? (
          <Text accessibilityLiveRegion="polite">{success}</Text>
        ) : null}
        {preview ? (
          <View style={styles.card}>
            <Text style={styles.heading}>Order {preview.orderNumber}</Text>
            <Text>Assigned facility: {preview.facility.name}</Text>
            <Text>Status: {preview.orderStatus.replace(/_/g, ' ')}</Text>
            <Text style={styles.heading}>Physical handover items</Text>
            {preview.items.length ? (
              preview.items.map((item, index) => (
                <Text key={`${item.item_name}-${index}`}>
                  {item.quantity} × {item.item_name}
                  {item.weight_kg ? ` · ${item.weight_kg} kg` : ''}
                </Text>
              ))
            ) : (
              <Text>
                No item details recorded. Check with dispatch before confirming.
              </Text>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.primaryButton}
              disabled={busy || !preview.items.length}
              onPress={() => {
                confirm();
              }}
            >
              <Text style={styles.primaryText}>Confirm physical receipt</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F6F2' },
  content: { padding: 18, gap: 16, paddingBottom: 36 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '800',
    color: '#67635B',
  },
  title: { fontSize: 30, fontWeight: '900' },
  heading: { fontSize: 19, fontWeight: '900' },
  help: { color: '#67635B', lineHeight: 21 },
  link: { fontWeight: '800' },
  input: {
    borderWidth: 1,
    borderColor: '#CFCAC0',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#E2DED6',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { height: 1, flex: 1, backgroundColor: '#D7D2C9' },
  or: { fontSize: 10, letterSpacing: 1, fontWeight: '800', color: '#777' },
  primaryButton: {
    minHeight: 50,
    backgroundColor: '#151515',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondaryButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#151515',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryText: { fontWeight: '900' },
  error: { color: '#9A241E' },
});
