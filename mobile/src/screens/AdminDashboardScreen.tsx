import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {AdminDashboard, getAdminDashboard} from '../services/adminDashboardApi';

type Props = {accessToken: string; onLogout: () => Promise<void>; onCustomers?: () => void; onStaff?: () => void; onAssignments?: () => void; onCatalogue?: () => void; onIssues?: () => void; onGrowth?: () => void; onFacilities?: () => void; onReports?: () => void};

function MenuItem({title, detail, onPress}: {title: string; detail: string; onPress?: () => void}) {
  if (!onPress) return null;
  return <TouchableOpacity accessibilityRole="button" style={styles.menuItem} onPress={onPress}><View style={styles.menuText}><Text style={styles.menuTitle}>{title}</Text><Text style={styles.menuDetail}>{detail}</Text></View><Text style={styles.arrow}>›</Text></TouchableOpacity>;
}

export default function AdminDashboardScreen({accessToken, onLogout, onCustomers, onStaff, onAssignments, onCatalogue, onIssues, onGrowth, onFacilities, onReports}: Props) {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {setDashboard(await getAdminDashboard(accessToken));}
    catch (cause) {
      setDashboard(null);
      setError(cause instanceof Error ? cause.message : 'Admin dashboard unavailable.');
    } finally {setLoading(false); setRefreshing(false);}
  }, [accessToken]);

  useEffect(() => {load();}, [load]);

  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {load(true);}} />}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>B&W ADMIN</Text><Text style={styles.title}>Operations centre</Text></View><TouchableOpacity accessibilityRole="button" onPress={() => {load(true);}}><Text style={styles.link}>Refresh</Text></TouchableOpacity></View>
    {loading ? <ActivityIndicator accessibilityLabel="Loading Admin dashboard" /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {error ? <TouchableOpacity accessibilityRole="button" onPress={() => {load();}}><Text style={styles.link}>Retry dashboard</Text></TouchableOpacity> : null}
    {dashboard ? <>
      <View style={styles.hero}><View><Text style={styles.heroNumber}>{dashboard.activeOrders}</Text><Text style={styles.heroLabel}>Active orders</Text></View><View><Text style={styles.heroNumber}>₹{dashboard.grossRevenue.toFixed(2)}</Text><Text style={styles.heroLabel}>Order value</Text></View></View>
      <View style={styles.metrics}><View style={styles.metricCard}><Text style={styles.metric}>{dashboard.processingOrders}</Text><Text>Processing</Text></View><View style={styles.metricCard}><Text style={styles.metric}>{dashboard.readyOrders}</Text><Text>Ready</Text></View><View style={styles.metricCard}><Text style={styles.metric}>{dashboard.activeDrivers}</Text><Text>Drivers</Text></View><View style={styles.metricCard}><Text style={styles.metric}>{dashboard.activeFacilities}</Text><Text>Facilities</Text></View></View>
      <Text style={styles.heading}>Order status</Text>
      <View style={styles.statusCard}>{dashboard.ordersByStatus.length ? dashboard.ordersByStatus.map(row =>
        <View key={row.status} style={styles.statusRow}><Text style={styles.statusName}>{row.status.replace(/_/g, ' ')}</Text><Text style={styles.statusCount}>{row.count}</Text></View>)
        : <Text>No orders yet.</Text>}
      </View>
    </> : null}
    <Text style={styles.heading}>Operations</Text><View style={styles.menu}>
      <MenuItem title="Orders & customers" detail="Search customers, orders and QR codes" onPress={onCustomers} />
      <MenuItem title="Driver assignments" detail="Dispatch, capacity and live jobs" onPress={onAssignments} />
      <MenuItem title="Facility operations" detail="Queues, discrepancies and processing" onPress={onFacilities} />
      <MenuItem title="Claims & refunds" detail="Resolve customer issues" onPress={onIssues} />
    </View>
    <Text style={styles.heading}>Management</Text><View style={styles.menu}>
      <MenuItem title="Staff management" detail="Drivers and facility teams" onPress={onStaff} />
      <MenuItem title="Services & pricing" detail="Catalogue and pricing policy" onPress={onCatalogue} />
      <MenuItem title="Growth programs" detail="Coupons, loyalty and packages" onPress={onGrowth} />
      <MenuItem title="Analytics & audit" detail="Performance, trends and action history" onPress={onReports} />
    </View>
    <TouchableOpacity accessibilityRole="button" style={styles.logout} onPress={() => {onLogout();}}><Text style={styles.logoutText}>Log out</Text></TouchableOpacity>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#F7F6F2'}, content: {padding: 18, gap: 15, paddingBottom: 38}, header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, eyebrow: {fontSize: 11, letterSpacing: 1.4, fontWeight: '800', color: '#67635B'}, title: {fontSize: 30, fontWeight: '900'}, heading: {fontSize: 20, fontWeight: '900', marginTop: 5}, hero: {backgroundColor: '#151515', borderRadius: 18, padding: 18, flexDirection: 'row', justifyContent: 'space-between'}, heroNumber: {color: '#fff', fontSize: 25, fontWeight: '900'}, heroLabel: {color: '#D4D0C8', marginTop: 3}, metrics: {flexDirection: 'row', flexWrap: 'wrap', gap: 8}, metricCard: {width: '48%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2DED6', borderRadius: 15, padding: 14}, metric: {fontWeight: '900', fontSize: 22}, statusCard: {backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2DED6', borderRadius: 16, overflow: 'hidden'}, statusRow: {flexDirection: 'row', justifyContent: 'space-between', padding: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2DED6'}, statusName: {textTransform: 'capitalize', fontWeight: '700'}, statusCount: {fontWeight: '900'}, menu: {borderWidth: 1, borderColor: '#E2DED6', borderRadius: 17, backgroundColor: '#fff', overflow: 'hidden'}, menuItem: {flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2DED6'}, menuText: {flex: 1}, menuTitle: {fontSize: 16, fontWeight: '900'}, menuDetail: {color: '#6D685F', marginTop: 3}, arrow: {fontSize: 26, color: '#555'}, link: {fontWeight: '900'}, logout: {padding: 15, borderRadius: 14, borderWidth: 1, borderColor: '#D7B4B0', alignItems: 'center'}, logoutText: {color: '#982C23', fontWeight: '900'}, error: {color: '#9A241E'}});
