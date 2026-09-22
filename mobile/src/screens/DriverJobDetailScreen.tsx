import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { requestAndroidLocationPermission } from '../services/deviceLocationService';
import {
  startDriverTripBackground,
  startDriverTripIos,
  stopDriverTripBackground,
  subscribeDriverTripStatus,
} from '../services/driverTripBackground';
import {
  DriverJobDetail,
  acceptDriverJob,
  beginFacilityTransit,
  formatDriverAddress,
  getDriverHandoffQr,
  getDriverJob,
  markDriverArrived,
  rejectDriverJob,
  reportCustomerUnavailable,
  startDriverNavigation,
  verifyDriverPickupOtp,
} from '../services/driverAssignmentsApi';
import {
  chooseDeliveryPhoto,
  completeDriverDelivery,
  uploadDeliveryPhoto,
} from '../services/driverDeliveryApi';
import QrGraphic from '../components/QrGraphic';

type Props = { accessToken: string; assignmentId: string; onBack: () => void };

export default function DriverJobDetailScreen({
  accessToken,
  assignmentId,
  onBack,
}: Props) {
  const [job, setJob] = useState<DriverJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [gpsState, setGpsState] = useState('');
  const [pickupOtp, setPickupOtp] = useState('');
  const [handoverChecked, setHandoverChecked] = useState(false);
  const [handoffCode, setHandoffCode] = useState('');
  const [deliveryOtp, setDeliveryOtp] = useState('');
  const [deliveryPhotoPath, setDeliveryPhotoPath] = useState('');
  const actionLock = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setJob(await getDriverJob(accessToken, assignmentId));
    } catch (cause) {
      setJob(null);
      setError(cause instanceof Error ? cause.message : 'Job unavailable.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, assignmentId]);
  useEffect(() => {
    load();
  }, [load]);
  const tripActive =
    job?.assignmentStatus === 'en_route' &&
    (job.orderStatus === 'en_route_pickup' ||
      job.orderStatus === 'en_route_delivery');
  useEffect(() => {
    if (!tripActive) {
      stopDriverTripBackground().catch(() => {});
      setGpsState('');
      return;
    }
    let cancelled = false;
    const unsubscribe = subscribeDriverTripStatus(status => {
      if (!cancelled) setGpsState(status);
    });
    const start = async () => {
      if (cancelled) return;
      try {
        if (!(await requestAndroidLocationPermission()))
          throw new Error(
            'Location permission denied. Enable location in Settings.',
          );
        if (cancelled) return;
        if (Platform.OS === 'android') {
          await startDriverTripBackground(assignmentId, accessToken);
        } else await startDriverTripIos(assignmentId, accessToken);
        setGpsState(
          'Sharing location during this trip, including while navigation is open.',
        );
      } catch (cause) {
        if (!cancelled)
          setGpsState(
            cause instanceof Error ? cause.message : 'GPS unavailable.',
          );
      }
    };
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') {
        load();
        start();
      } else setGpsState('Location sharing continues for this active trip.');
    });
    start();
    const verify = setInterval(async () => {
      try {
        const latest = await getDriverJob(accessToken, assignmentId);
        if (!cancelled) setJob(latest);
      } catch {
        if (!cancelled) {
          stopDriverTripBackground().catch(() => {});
          setGpsState('Trip is no longer available.');
        }
      }
    }, 30000);
    return () => {
      cancelled = true;
      unsubscribe();
      appState?.remove();
      clearInterval(verify);
    };
  }, [accessToken, assignmentId, load, tripActive]);

  const beginTrip = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError('');
    try {
      await startDriverNavigation(accessToken, assignmentId);
      await load();
      setMessage('Trip started. Live GPS is active during navigation.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to start trip.',
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const arrive = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await markDriverArrived(accessToken, assignmentId);
      await load();
      setMessage(
        job?.type === 'delivery'
          ? 'Arrived at delivery. Ask the customer for their delivery OTP and take a proof photo.'
          : 'Arrived at pickup. Ask the customer for their pickup OTP.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to mark arrival.',
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const completePickup = async () => {
    if (actionLock.current) return;
    if (!handoverChecked) {
      setError('Review and confirm the garments handed over.');
      return;
    }
    if (!/^\d{6}$/.test(pickupOtp.trim())) {
      setError('Enter the six-digit pickup OTP.');
      return;
    }
    actionLock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await verifyDriverPickupOtp(
        accessToken,
        job!.orderId,
        pickupOtp,
      );
      if (!result.verified || result.orderStatus !== 'picked_up')
        throw new Error(
          'Pickup was not confirmed. Refresh the job before retrying.',
        );
      setPickupOtp('');
      setHandoverChecked(false);
      await load();
      setMessage('Pickup completed. The customer can see the updated order.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to verify pickup OTP.',
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const selectDeliveryPhoto = async (source: 'camera' | 'library') => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const photo = await chooseDeliveryPhoto(source);
      if (!photo) return;
      const path = await uploadDeliveryPhoto(accessToken, job!.orderId, photo);
      setDeliveryPhotoPath(path);
      setMessage(
        'Delivery photograph uploaded. Verify the customer OTP to complete delivery.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to upload delivery photograph.',
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const completeDelivery = async () => {
    if (actionLock.current) return;
    if (!/^\d{6}$/.test(deliveryOtp.trim())) {
      setError('Enter the six-digit delivery OTP.');
      return;
    }
    if (!deliveryPhotoPath) {
      setError('Take and upload a delivery photograph first.');
      return;
    }
    actionLock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await completeDriverDelivery(
        accessToken,
        job!.orderId,
        deliveryOtp,
        deliveryPhotoPath,
      );
      if (!result.delivered || result.orderStatus !== 'claim_period_active')
        throw new Error(
          'Delivery was not confirmed. Refresh the job before retrying.',
        );
      setDeliveryOtp('');
      setDeliveryPhotoPath('');
      await stopDriverTripBackground();
      await load();
      setMessage(
        'Delivery complete. Proof was retained and customer tracking has ended.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to complete delivery.',
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const startFacilityHandoff = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await beginFacilityTransit(accessToken, assignmentId);
      await load();
      setMessage(
        'Transit started. Take this order to the assigned facility for staff receipt.',
      );
      await openFacilityDirections();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to start facility transit.',
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const showHandoffCode = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await getDriverHandoffQr(accessToken, assignmentId);
      if (result.orderId !== job?.orderId || !result.payload.startsWith('BW1:'))
        throw new Error('Handoff code is unavailable.');
      setHandoffCode(result.payload);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load handoff code.',
      );
    } finally {
      setBusy(false);
    }
  };
  const openFacilityDirections = async () => {
    const lat = Number(job?.facility?.latitude),
      lon = Number(job?.facility?.longitude);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      job?.facility?.latitude == null ||
      job?.facility?.longitude == null
    ) {
      setError(
        'Assigned facility coordinates are unavailable. Contact dispatch.',
      );
      return;
    }
    const destination = `${lat},${lon}`;
    try {
      await Linking.openURL(
        Platform.OS === 'ios'
          ? `maps://?daddr=${destination}`
          : `google.navigation:q=${destination}`,
      );
    } catch {
      setError('Native navigation is unavailable on this device.');
    }
  };
  const openDirections = async () => {
    const lat = Number(job?.address?.latitude),
      lon = Number(job?.address?.longitude);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      !job?.address?.latitude ||
      !job?.address?.longitude
    ) {
      setError(
        'Customer address coordinates are unavailable. Contact dispatch.',
      );
      return;
    }
    const destination = `${lat},${lon}`;
    const url =
      Platform.OS === 'ios'
        ? `maps://?daddr=${destination}`
        : `google.navigation:q=${destination}`;
    try {
      await Linking.openURL(url);
    } catch {
      setError('Native navigation is unavailable on this device.');
    }
  };
  const respond = async (accept: boolean) => {
    if (actionLock.current) return;
    if (!accept && !reason.trim()) {
      setError('A rejection reason is required.');
      return;
    }
    actionLock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (accept) {
        await acceptDriverJob(accessToken, assignmentId);
      } else {
        await rejectDriverJob(accessToken, assignmentId, reason);
        onBack();
        return;
      }
      setMessage('Job accepted.');
      setReason('');
      await load();
    } catch (cause) {
      await load();
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to update job. Refresh and try again.',
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const customerUnavailable = async (
    outcome: 'customer_not_home' | 'customer_not_answering',
  ) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await reportCustomerUnavailable(
        accessToken,
        assignmentId,
        outcome,
      );
      onBack();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to record customer availability.',
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.link}>← Back to dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.eyebrow}>ASSIGNMENT</Text>
        <Text style={styles.title}>Job details</Text>
        {loading ? (
          <ActivityIndicator accessibilityLabel="Loading job details" />
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {message ? <Text accessibilityRole="alert">{message}</Text> : null}
        {error ? (
          <TouchableOpacity
            onPress={() => {
              load();
            }}
          >
            <Text style={styles.link}>Retry job</Text>
          </TouchableOpacity>
        ) : null}
        {job ? (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={styles.typeBadge}>
                {job.type === 'pickup' ? 'PICKUP' : 'DELIVERY'}
              </Text>
              <Text style={styles.statusText}>
                {job.assignmentStatus.replace(/_/g, ' ')}
              </Text>
            </View>
            <Text style={styles.orderStatus}>
              {job.orderStatus.replace(/_/g, ' ')}
            </Text>
            <Text style={styles.heading}>Order ID</Text>
            <Text>{job.orderNumber}</Text>
            <Text style={styles.heading}>
              {job.type === 'pickup' ? 'Pickup address' : 'Delivery address'}
            </Text>
            <Text>{formatDriverAddress(job.address)}</Text>
            <Text style={styles.heading}>Assigned facility</Text>
            {job.facility ? (
              <>
                <Text>
                  {job.facility.name}
                  {job.facility.address ? ` · ${job.facility.address}` : ''}
                </Text>
              </>
            ) : (
              <Text>Facility unavailable</Text>
            )}
            {job.customer ? (
              <>
                <Text style={styles.heading}>Customer contact</Text>
                <Text>{job.customer.name || 'Name unavailable'}</Text>
                <Text>{job.customer.phone || 'Phone unavailable'}</Text>
              </>
            ) : null}
            <Text>Assigned: {new Date(job.assignedAt).toLocaleString()}</Text>
            {job.acceptedAt ? (
              <Text>Accepted: {new Date(job.acceptedAt).toLocaleString()}</Text>
            ) : null}
            {job.completedAt ? (
              <Text>
                Completed: {new Date(job.completedAt).toLocaleString()}
              </Text>
            ) : null}
            {job.pickupScheduledAt ? (
              <Text>
                Pickup: {new Date(job.pickupScheduledAt).toLocaleString()}{' '}
                {job.pickupSlotLabel ?? ''}
              </Text>
            ) : null}
            {job.assignmentStatus === 'assigned' &&
            (job.orderStatus === 'pickup_assigned' ||
              job.orderStatus === 'delivery_assigned') ? (
              <View style={styles.actions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.primaryButton}
                  disabled={busy}
                  onPress={() => {
                    respond(true);
                  }}
                >
                  <Text style={styles.primaryText}>Accept job</Text>
                </TouchableOpacity>
                <TextInput
                  accessibilityLabel="Rejection reason"
                  placeholder="Reason for rejection"
                  value={reason}
                  onChangeText={setReason}
                  editable={!busy}
                  style={styles.input}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.dangerButton}
                  disabled={busy}
                  onPress={() => {
                    respond(false);
                  }}
                >
                  <Text style={styles.dangerText}>Reject job</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {job.assignmentStatus === 'accepted' &&
            (job.orderStatus === 'pickup_accepted' ||
              job.orderStatus === 'delivery_accepted') ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.primaryButton}
                disabled={busy}
                onPress={() => {
                  beginTrip();
                }}
              >
                <Text style={styles.primaryText}>Start trip</Text>
              </TouchableOpacity>
            ) : null}
            {tripActive ? (
              <>
                <Text accessibilityLiveRegion="polite">
                  {gpsState || 'Starting GPS…'}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.navigationButton}
                  onPress={() => {
                    openDirections();
                  }}
                >
                  <Text style={styles.primaryText}>Navigate to {job.type}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.secondaryButton}
                  disabled={busy}
                  onPress={() => {
                    arrive();
                  }}
                >
                  <Text style={styles.secondaryText}>
                    {job.type === 'pickup'
                      ? 'I arrived at pickup'
                      : 'I arrived at delivery'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
            {job.type === 'pickup' &&
            job.assignmentStatus === 'arrived' &&
            job.orderStatus === 'pickup_otp_pending' ? (
              <View style={styles.actions}>
                <Text style={styles.heading}>Garment handover</Text>
                <Text>
                  Review the customer’s listed items, then ask for the pickup
                  OTP. Completion is recorded only after the OTP is verified.
                </Text>
                {job.items?.length ? (
                  job.items.map(item => (
                    <Text key={item.id}>
                      {item.item_name} · {item.quantity} item
                      {item.quantity === 1 ? '' : 's'}
                      {item.weight_kg != null ? ` · ${item.weight_kg} kg` : ''}
                      {item.customer_notes ? ` · ${item.customer_notes}` : ''}
                    </Text>
                  ))
                ) : (
                  <Text>No item details were recorded at checkout.</Text>
                )}
                <TouchableOpacity
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: handoverChecked }}
                  onPress={() => setHandoverChecked(!handoverChecked)}
                >
                  <Text>
                    {handoverChecked ? '☑' : '☐'} I checked the garments handed
                    over
                  </Text>
                </TouchableOpacity>
                <TextInput
                  accessibilityLabel="Customer pickup OTP"
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="Six-digit pickup OTP"
                  value={pickupOtp}
                  onChangeText={setPickupOtp}
                  editable={!busy}
                  style={styles.input}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    completePickup();
                  }}
                >
                  <Text style={styles.link}>
                    Verify OTP and complete pickup
                  </Text>
                </TouchableOpacity>
                <View style={styles.outcomePanel}>
                  <Text style={styles.heading}>Customer unavailable?</Text>
                  <Text>
                    Use these options only after reaching the pickup address.
                    The pickup order will be cancelled and the customer will be
                    notified.
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.dangerButton}
                    disabled={busy}
                    onPress={() => customerUnavailable('customer_not_home')}
                  >
                    <Text style={styles.dangerText}>Customer not at home</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.dangerButton}
                    disabled={busy}
                    onPress={() =>
                      customerUnavailable('customer_not_answering')
                    }
                  >
                    <Text style={styles.dangerText}>
                      Customer not answering calls
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            {job.type === 'delivery' &&
            job.assignmentStatus === 'arrived' &&
            job.orderStatus === 'delivery_otp_pending' ? (
              <View style={styles.actions}>
                <Text style={styles.heading}>Delivery handover</Text>
                <Text>
                  Ask the customer for their delivery OTP. A delivery photograph
                  is required before completion.
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    selectDeliveryPhoto('camera');
                  }}
                >
                  <Text style={styles.link}>
                    {deliveryPhotoPath
                      ? 'Retake delivery photo'
                      : 'Take delivery photo'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    selectDeliveryPhoto('library');
                  }}
                >
                  <Text style={styles.link}>Choose photo from phone</Text>
                </TouchableOpacity>
                {deliveryPhotoPath ? (
                  <Text accessibilityLiveRegion="polite">
                    Delivery photograph uploaded
                  </Text>
                ) : (
                  <Text>No delivery photograph uploaded.</Text>
                )}
                <TextInput
                  accessibilityLabel="Customer delivery OTP"
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="Six-digit delivery OTP"
                  value={deliveryOtp}
                  onChangeText={setDeliveryOtp}
                  editable={!busy}
                  style={styles.input}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    completeDelivery();
                  }}
                >
                  <Text style={styles.link}>
                    Verify OTP and complete delivery
                  </Text>
                </TouchableOpacity>
                <View style={styles.outcomePanel}>
                  <Text style={styles.heading}>Customer unavailable?</Text>
                  <Text>
                    Use these options only after reaching the delivery address.
                    The order will remain active, delivery will move to tomorrow,
                    and the customer will be notified.
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.secondaryButton}
                    disabled={busy}
                    onPress={() => customerUnavailable('customer_not_home')}
                  >
                    <Text style={styles.secondaryText}>
                      Customer not at home
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.secondaryButton}
                    disabled={busy}
                    onPress={() =>
                      customerUnavailable('customer_not_answering')
                    }
                  >
                    <Text style={styles.secondaryText}>
                      Customer not answering calls
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            {job.type === 'delivery' &&
            job.assignmentStatus === 'completed' &&
            (job.orderStatus === 'delivered' ||
              job.orderStatus === 'claim_period_active') ? (
              <Text accessibilityLiveRegion="polite">
                Delivery complete. Proof retained; tracking ended.
              </Text>
            ) : null}
            {job.type === 'pickup' &&
            job.assignmentStatus === 'arrived' &&
            job.orderStatus === 'picked_up' ? (
              <View style={styles.actions}>
                <Text accessibilityLiveRegion="polite">
                  Pickup complete. Take the garments to the assigned facility.
                </Text>
                {job.facility ? (
                  <Text>
                    Facility: {job.facility.name}
                    {job.facility.address ? ` · ${job.facility.address}` : ''}
                  </Text>
                ) : (
                  <Text>Assigned facility unavailable. Contact dispatch.</Text>
                )}
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={busy || !job.facility}
                  onPress={() => {
                    startFacilityHandoff();
                  }}
                >
                  <Text style={styles.link}>Start facility transit</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {job.type === 'pickup' &&
            job.assignmentStatus === 'arrived' &&
            job.orderStatus === 'in_transit_to_facility' ? (
              <View style={styles.actions}>
                <Text accessibilityLiveRegion="polite">
                  Facility handoff pending. Facility staff must verify this
                  order and confirm receipt.
                </Text>
                <Text>
                  Assigned facility: {job.facility?.name || 'Unavailable'}
                  {job.facility?.address ? ` · ${job.facility.address}` : ''}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.navigationButton}
                  onPress={() => {
                    openFacilityDirections();
                  }}
                >
                  <Text style={styles.primaryText}>Navigate to facility</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.secondaryButton}
                  disabled={busy}
                  onPress={() => {
                    showHandoffCode();
                  }}
                >
                  <Text style={styles.secondaryText}>
                    Show facility handoff QR
                  </Text>
                </TouchableOpacity>
                {handoffCode ? (
                  <View style={styles.qrCard}>
                    <Text style={styles.heading}>Facility handoff</Text>
                    <Text style={styles.orderReference}>
                      Order {job.orderNumber}
                    </Text>
                    <Text style={styles.help}>
                      Facility staff can scan this QR or enter the order number
                      above before accepting the garments.
                    </Text>
                    <QrGraphic
                      payload={handoffCode}
                      accessibilityLabel="Facility handoff QR code"
                    />
                  </View>
                ) : null}
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    load();
                  }}
                >
                  <Text style={styles.link}>Refresh receipt status</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {job.type === 'pickup' &&
            job.assignmentStatus === 'completed' &&
            job.orderStatus === 'received_at_facility' ? (
              <Text accessibilityLiveRegion="polite">
                Facility confirmed receipt. Pickup responsibility is complete.
              </Text>
            ) : null}
          </View>
        ) : !loading && !error ? (
          <Text>Job not found.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F6F2' },
  content: { padding: 18, gap: 14, paddingBottom: 36 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '800',
    color: '#67635B',
  },
  title: { fontSize: 30, fontWeight: '900' },
  heading: { fontSize: 18, fontWeight: '900' },
  link: { fontWeight: '800' },
  error: { color: '#9A241E' },
  outcomePanel: {
    borderTopWidth: 1,
    borderTopColor: '#E2DED6',
    paddingTop: 14,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: '#E2DED6',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    backgroundColor: '#E7F3EB',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    fontWeight: '900',
    fontSize: 11,
  },
  statusText: {
    fontWeight: '800',
    textTransform: 'capitalize',
    color: '#5E5A53',
  },
  orderStatus: { fontSize: 20, fontWeight: '900', textTransform: 'capitalize' },
  actions: {
    gap: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDD8CF',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CFCAC0',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#151515',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  navigationButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#145C3A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#151515',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryText: { fontWeight: '900', fontSize: 16 },
  dangerButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B94A40',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  dangerText: { fontWeight: '900', color: '#9A241E' },
  qrCard: {
    alignItems: 'center',
    backgroundColor: '#F3F0E9',
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  orderReference: { fontSize: 17, fontWeight: '900', textAlign: 'center' },
  help: { color: '#666159', textAlign: 'center' },
});
