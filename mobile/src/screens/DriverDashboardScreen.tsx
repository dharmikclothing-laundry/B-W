import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {DriverDashboard, DriverJob, formatDriverAddress, getDriverDashboard} from '../services/driverAssignmentsApi';

type Props = {accessToken: string; onJob: (id: string) => void; onNotifications: () => void; onProfile: () => void; onLogout: () => Promise<void>};

const readable = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const actionLabel = (job: DriverJob) => job.assignmentStatus === 'assigned' ? 'Review assignment' :
  job.assignmentStatus === 'accepted' ? 'Start route' : job.assignmentStatus === 'en_route' ? 'Navigate' : 'Continue handoff';

function JobQueue({title, jobs, onJob}: {title: string; jobs: DriverJob[]; onJob: (id: string) => void}) {
  return <View style={styles.section}>
    <Text style={styles.heading}>{title}</Text>
    {jobs.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>All clear</Text><Text style={styles.muted}>No {title.toLowerCase()} assigned.</Text></View> : jobs.map(job =>
      <View key={job.id} style={styles.card}>
        <View style={styles.cardTop}><View style={[styles.badge, job.type === 'pickup' ? styles.pickupBadge : styles.deliveryBadge]}><Text style={styles.badgeText}>{job.type === 'pickup' ? 'PICKUP' : 'DELIVERY'}</Text></View><Text style={styles.status}>{readable(job.assignmentStatus)}</Text></View>
        <Text style={styles.address}>{formatDriverAddress(job.address)}</Text>
        {job.type === 'pickup' && job.pickupScheduledAt ? <Text style={styles.meta}>{new Date(job.pickupScheduledAt).toLocaleString()} {job.pickupSlotLabel ?? ''}</Text> : null}
        <Text style={styles.meta}>Assigned {new Date(job.assignedAt).toLocaleString()}</Text>
        <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={() => onJob(job.id)}><Text style={styles.primaryText}>{actionLabel(job)} →</Text></TouchableOpacity>
      </View>)}
  </View>;
}

export default function DriverDashboardScreen({accessToken, onJob, onNotifications, onProfile, onLogout}: Props) {
  const [dashboard, setDashboard] = useState<DriverDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {setDashboard(await getDriverDashboard(accessToken));}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Assignments unavailable.');}
    finally {setLoading(false); setRefreshing(false);}
  }, [accessToken]);
  useEffect(() => {load();}, [load]);

  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {load(true);}} />}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>DRIVER OPERATIONS</Text><Text style={styles.title}>Today’s route</Text></View><View style={styles.headerActions}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Driver notifications" style={styles.icon} onPress={onNotifications}><Text>🔔</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Driver profile" style={styles.icon} onPress={onProfile}><Text>◉</Text></TouchableOpacity>
    </View></View>
    {loading ? <ActivityIndicator accessibilityLabel="Loading assignments" /> : null}
    {error ? <View style={styles.alert}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><TouchableOpacity onPress={() => {load();}}><Text style={styles.link}>Retry assignments</Text></TouchableOpacity></View> : null}
    {dashboard ? <>
      <Text style={styles.date}>{dashboard.date}</Text>
      <View style={styles.summary}>
        <View><Text style={styles.metric}>{dashboard.summary.pending}</Text><Text style={styles.summaryLabel}>To accept</Text></View>
        <View><Text style={styles.metric}>{dashboard.summary.inProgress}</Text><Text style={styles.summaryLabel}>In progress</Text></View>
        <View><Text style={styles.metric}>{dashboard.summary.completed}</Text><Text style={styles.summaryLabel}>Completed</Text></View>
      </View>
      <View style={styles.split}><Text style={styles.splitText}>Pickups {dashboard.summary.pickups}</Text><Text style={styles.splitText}>Deliveries {dashboard.summary.deliveries}</Text></View>
      <JobQueue title="Pickup queue" jobs={dashboard.pickups} onJob={onJob} />
      <JobQueue title="Delivery queue" jobs={dashboard.deliveries} onJob={onJob} />
    </> : !loading && !error ? <Text>No assignment data available.</Text> : null}
    <TouchableOpacity accessibilityRole="button" style={styles.logout} onPress={() => {onLogout();}}><Text style={styles.logoutText}>Log out</Text></TouchableOpacity>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#F7F6F2'}, content: {padding: 18, paddingBottom: 36, gap: 16}, header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, headerActions: {flexDirection: 'row', gap: 8}, eyebrow: {fontSize: 11, letterSpacing: 1.4, fontWeight: '800', color: '#67635B'}, title: {fontSize: 30, fontWeight: '900', color: '#151515'}, icon: {width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2DED6', alignItems: 'center', justifyContent: 'center'}, date: {fontWeight: '700', color: '#67635B'}, summary: {flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#151515', borderRadius: 18, padding: 18}, metric: {color: '#fff', fontSize: 26, fontWeight: '900'}, summaryLabel: {color: '#D8D5CE'}, muted: {color: '#6D685F'}, split: {flexDirection: 'row', gap: 8}, splitText: {flex: 1, backgroundColor: '#EDEAE3', borderRadius: 12, padding: 12, fontWeight: '800'}, section: {gap: 10}, heading: {fontSize: 21, fontWeight: '900', color: '#181715'}, card: {backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#E2DED6', padding: 16, gap: 9}, cardTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}, badge: {borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5}, pickupBadge: {backgroundColor: '#E7F3EB'}, deliveryBadge: {backgroundColor: '#E8EEF8'}, badgeText: {fontSize: 11, fontWeight: '900'}, status: {fontWeight: '800', color: '#5E5A53'}, address: {fontSize: 17, lineHeight: 23, fontWeight: '800'}, meta: {color: '#6D685F'}, primaryButton: {minHeight: 46, backgroundColor: '#151515', borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginTop: 4}, primaryText: {color: '#fff', fontWeight: '900'}, empty: {backgroundColor: '#EDEAE3', borderRadius: 16, padding: 16}, emptyTitle: {fontWeight: '900', fontSize: 16}, alert: {backgroundColor: '#FFF0EE', borderRadius: 14, padding: 14, gap: 8}, error: {color: '#9A241E'}, link: {fontWeight: '900'}, logout: {alignItems: 'center', padding: 14}, logoutText: {color: '#8C2D26', fontWeight: '800'}});
