import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  FacilityDashboard,
  getFacilityDashboard,
} from '../services/facilityDashboardApi';

type Props = {
  accessToken: string;
  onLogout: () => Promise<void>;
  onIntake: () => void;
  onOrder: (orderId: string) => void;
};

export default function FacilityDashboardScreen({
  accessToken,
  onLogout,
  onIntake,
  onOrder,
}: Props) {
  const [tab, setTab] = useState<'received' | 'processing' | 'ready'>(
    'received',
  );
  const [dashboard, setDashboard] = useState<FacilityDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        setDashboard(await getFacilityDashboard(accessToken));
      } catch (cause) {
        setDashboard(null);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Facility dashboard unavailable.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken],
  );
  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              load(true);
            }}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>FACILITY OPERATIONS</Text>
            <Text style={styles.title}>Work queue</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              load(true);
            }}
          >
            <Text style={styles.link}>Refresh</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.scanButton}
          onPress={onIntake}
        >
          <Text style={styles.scanText}>▣ Scan incoming order</Text>
        </TouchableOpacity>
        {loading ? (
          <ActivityIndicator accessibilityLabel="Loading facility dashboard" />
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {error ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              load();
            }}
          >
            <Text style={styles.link}>Retry dashboard</Text>
          </TouchableOpacity>
        ) : null}
        {dashboard ? (
          <>
            <View style={styles.facilityCard}>
              <View style={styles.facilityIdentity}>
                <Text style={styles.heading}>{dashboard.facility.name}</Text>
                <Text style={styles.muted}>
                  {dashboard.role === 'manager'
                    ? 'Facility Manager'
                    : 'Facility Staff'}
                </Text>
              </View>
              <Text style={styles.incoming}>
                Incoming {dashboard.summary.incoming}
              </Text>
            </View>
            {dashboard.facility.address ? (
              <Text style={styles.muted}>{dashboard.facility.address}</Text>
            ) : null}
            <View style={styles.tabs}>
              {(
                [
                  {
                    key: 'received',
                    label: 'Received',
                    count: dashboard.summary.received,
                  },
                  {
                    key: 'processing',
                    label: 'Processing',
                    count: dashboard.summary.processing,
                  },
                  {
                    key: 'ready',
                    label: 'Ready',
                    count: dashboard.summary.ready,
                  },
                ] as const
              ).map(item => (
                <TouchableOpacity
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === item.key }}
                  style={[styles.tab, tab === item.key && styles.activeTab]}
                  onPress={() => setTab(item.key)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      tab === item.key && styles.activeTabText,
                    ]}
                  >
                    {item.label} {item.count}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.heading}>
              {tab === 'received'
                ? 'Received orders'
                : tab === 'processing'
                ? 'In processing'
                : 'Ready for delivery'}
            </Text>
            {dashboard.orders
              .filter(order =>
                tab === 'received'
                  ? [
                      'received_at_facility',
                      'verification',
                      'in_transit_to_facility',
                    ].includes(order.current_status)
                  : tab === 'processing'
                  ? ['processing', 'quality_check', 'rework_required'].includes(
                      order.current_status,
                    )
                  : order.current_status === 'ready_for_delivery',
              )
              .map(order => (
                <TouchableOpacity
                  key={order.id}
                  style={styles.card}
                  accessibilityRole="button"
                  onPress={() => onOrder(order.id)}
                >
                  <View style={styles.orderTop}>
                    <Text style={styles.orderNumber}>{order.order_number}</Text>
                    <Text style={styles.status}>
                      {order.current_status.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <Text style={styles.link}>
                    {tab === 'received'
                      ? 'Verify garments'
                      : tab === 'processing'
                      ? 'Continue processing'
                      : 'Review handoff'}{' '}
                    →
                  </Text>
                </TouchableOpacity>
              ))}
            {!dashboard.orders.filter(order =>
              tab === 'received'
                ? [
                    'received_at_facility',
                    'verification',
                    'in_transit_to_facility',
                  ].includes(order.current_status)
                : tab === 'processing'
                ? ['processing', 'quality_check', 'rework_required'].includes(
                    order.current_status,
                  )
                : order.current_status === 'ready_for_delivery',
            ).length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No {tab} orders</Text>
                <Text style={styles.muted}>This queue is clear.</Text>
              </View>
            ) : null}
          </>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.logout}
          onPress={() => {
            onLogout();
          }}
        >
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F6F2' },
  content: { padding: 18, gap: 14, paddingBottom: 36 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.4,
    color: '#67635B',
    fontWeight: '800',
  },
  title: { fontSize: 30, fontWeight: '900' },
  heading: { fontSize: 20, fontWeight: '900', flexShrink: 1 },
  scanButton: {
    backgroundColor: '#151515',
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  facilityCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2DED6',
    gap: 10,
  },
  facilityIdentity: { flex: 1, minWidth: 0, gap: 3 },
  incoming: {
    backgroundColor: '#FFF1CF',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontWeight: '800',
    flexShrink: 0,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#EAE7E0',
    borderRadius: 14,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 11 },
  activeTab: { backgroundColor: '#fff' },
  tabText: {
    fontWeight: '800',
    color: '#656159',
    fontSize: 12,
    textAlign: 'center',
  },
  activeTabText: { color: '#151515' },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2DED6',
    backgroundColor: '#fff',
    borderRadius: 16,
    gap: 9,
  },
  orderTop: { gap: 5, alignItems: 'flex-start' },
  orderNumber: { fontWeight: '900', fontSize: 16, flexShrink: 1 },
  status: { color: '#67635B', textTransform: 'capitalize', flexShrink: 1 },
  link: { fontWeight: '900' },
  muted: { color: '#6D685F', flexShrink: 1 },
  empty: { backgroundColor: '#EDEAE3', borderRadius: 16, padding: 18 },
  emptyTitle: { fontWeight: '900', fontSize: 17 },
  logout: { alignItems: 'center', padding: 14 },
  logoutText: { fontWeight: '800', color: '#8C2D26' },
  error: { color: '#9A241E' },
});
