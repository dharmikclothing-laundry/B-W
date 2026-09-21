import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {AdminAssignmentDetail, AdminAssignmentOverview, AdminDriver, AdminJob, assignAdminDriver, getAdminAssignmentDetail, listAdminAssignments, reassignAdminDriver} from '../services/adminAssignmentsApi';

type Props = {accessToken: string; onBack: () => void};
export default function AdminAssignmentsScreen({accessToken, onBack}: Props) {
  const [overview, setOverview] = useState<AdminAssignmentOverview | null>(null);
  const [selected, setSelected] = useState<AdminJob | null>(null);
  const [detail, setDetail] = useState<AdminAssignmentDetail | null>(null);
  const [driverId, setDriverId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = useCallback(async (orderId?: string) => {
    setLoading(true); setError('');
    try {
      const [next, nextDetail] = await Promise.all([listAdminAssignments(accessToken), orderId ? getAdminAssignmentDetail(accessToken, orderId) : Promise.resolve(null)]);
      setOverview(next); setDetail(nextDetail);
      if (orderId) setSelected(next.jobs.find(job => job.orderId === orderId) ?? null);
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Assignments unavailable.');}
    finally {setLoading(false);}
  }, [accessToken]);
  useEffect(() => {load();}, [load]);
  const open = async (job: AdminJob) => {setSelected(job); setDriverId(''); setSuccess(''); await load(job.orderId);};
  const submit = async () => {
    if (!selected || saving) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      if (selected.assignment) await reassignAdminDriver(accessToken, selected.assignment.id, driverId);
      else await assignAdminDriver(accessToken, selected.orderId, driverId, selected.type);
      setSuccess('Driver assignment updated.'); setDriverId(''); await load(selected.orderId);
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Assignment update failed. Refresh and try again.');}
    finally {setSaving(false);}
  };
  const available = (overview?.drivers ?? []).filter(driver => driver.isActive && driver.isAvailable && driver.activeJobs < driver.maxConcurrentJobs && driver.id !== selected?.assignment?.driver_id);
  const driversById = new Map((overview?.drivers ?? []).map(driver => [driver.id, driver.name]));
  const jobLine = (job: AdminJob) => `${job.type === 'pickup' ? 'Pickup' : 'Delivery'} · ${job.orderStatus.replace(/_/g, ' ')} · ${job.assignment?.status ?? 'unassigned'}${job.stale ? ' · stale' : ''}`;
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => {load(selected?.orderId);}} />}>
    <TouchableOpacity accessibilityRole="button" onPress={selected ? () => {setSelected(null); setDetail(null); setDriverId('');} : onBack}><Text style={styles.link}>← {selected ? 'Assignment queue' : 'Admin dashboard'}</Text></TouchableOpacity>
    <Text style={styles.title}>Driver assignments</Text>
    {loading ? <ActivityIndicator accessibilityLabel="Loading assignments" /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {error ? <TouchableOpacity accessibilityRole="button" onPress={() => {load(selected?.orderId);}}><Text style={styles.link}>Retry assignments</Text></TouchableOpacity> : null}
    {success ? <Text accessibilityRole="alert">{success}</Text> : null}
    {!selected && overview ? <>
      <Text style={styles.heading}>Unassigned and active jobs</Text>
      {!overview.jobs.length ? <Text>No eligible pickup or delivery jobs.</Text> : overview.jobs.map(job =>
        <TouchableOpacity accessibilityRole="button" key={job.orderId} style={styles.card} onPress={() => {open(job);}}>
          <Text style={styles.bold}>Order {job.orderNumber}</Text><Text>{jobLine(job)}</Text>
          {job.assignment ? <Text>Driver: {driversById.get(job.assignment.driver_id) ?? 'Unavailable'}</Text> : null}
          {job.lastAssignment?.status === 'rejected' ? <Text>Last offer rejected</Text> : null}
        </TouchableOpacity>)}
      <Text style={styles.heading}>Driver workload</Text>
      {overview.drivers.map(driver => <Text key={driver.id}>{driver.name}: {driver.activeJobs}/{driver.maxConcurrentJobs} jobs · {driver.isActive && driver.isAvailable ? 'Available' : 'Unavailable'}</Text>)}
    </> : null}
    {selected && overview ? <>
      <Text style={styles.heading}>Order {selected.orderNumber}</Text><Text>{jobLine(selected)}</Text>
      {detail?.tracking ? <Text>GPS update: {detail.tracking.stale ? 'stale' : 'recent'} · {new Date(detail.tracking.recordedAt).toLocaleString()}</Text> : <Text>No live GPS update.</Text>}
      <Text style={styles.heading}>{selected.assignment ? 'Reassign Driver' : 'Assign Driver'}</Text>
      {!selected.assignment && !selected.canAssign ? <Text>This order is no longer eligible for assignment.</Text> : null}
      {!available.length ? <Text>No available Drivers with capacity.</Text> : available.map((driver: AdminDriver) =>
        <TouchableOpacity accessibilityRole="button" key={driver.id} onPress={() => setDriverId(driver.id)}><Text style={driverId === driver.id ? styles.selected : styles.link}>{driver.name} · {driver.activeJobs}/{driver.maxConcurrentJobs} jobs</Text></TouchableOpacity>)}
      {(selected.assignment || selected.canAssign) && available.length ? <TouchableOpacity accessibilityRole="button" disabled={saving || !driverId} onPress={submit}><Text style={styles.link}>{saving ? 'Saving…' : selected.assignment ? 'Confirm reassignment' : 'Assign Driver'}</Text></TouchableOpacity> : null}
      <Text style={styles.heading}>Assignment history</Text>
      {!detail?.assignments.length ? <Text>No prior assignments.</Text> : detail.assignments.map(row =>
        <View key={row.id} style={styles.card}><Text>{row.assignment_type} · {row.status} · {driversById.get(row.driver_id) ?? 'Former Driver'}</Text>
          <Text>{new Date(row.assigned_at).toLocaleString()}</Text>{row.rejection_reason ? <Text>Reason: {row.rejection_reason}</Text> : null}</View>)}
      <Text style={styles.heading}>Admin audit</Text>
      {!detail?.audit.length ? <Text>No Admin assignment action recorded.</Text> : detail.audit.map(row => <Text key={row.id}>{row.action} · {new Date(row.created_at).toLocaleString()}</Text>)}
    </> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#fff'}, content: {padding: 20, gap: 13}, title: {fontSize: 25, fontWeight: '700'}, heading: {fontSize: 19, fontWeight: '700'}, card: {padding: 13, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, gap: 3}, bold: {fontWeight: '700'}, link: {fontWeight: '700'}, selected: {fontWeight: '700', color: '#1155aa'}, error: {color: '#a11'}});
