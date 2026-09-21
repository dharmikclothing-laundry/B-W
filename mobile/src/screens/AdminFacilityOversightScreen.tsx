import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {FacilityDetail, FacilityOrderAudit, FacilityOversight, getAdminFacility, getAdminFacilityOrder,
  listAdminFacilities} from '../services/adminFacilityOversightApi';

type Props = {accessToken: string; facilityId?: string; orderId?: string; onBack: () => void;
  onFacility?: (id: string) => void; onOrder?: (facilityId: string, orderId: string) => void};
const label = (value: string) => value.replace(/_/g, ' ');
const date = (value?: string | null) => value ? new Date(value).toLocaleString('en-IN') : 'Pending';

export default function AdminFacilityOversightScreen({accessToken, facilityId, orderId, onBack, onFacility, onOrder}: Props) {
  const [overview, setOverview] = useState<FacilityOversight | null>(null);
  const [facility, setFacility] = useState<FacilityDetail | null>(null);
  const [audit, setAudit] = useState<FacilityOrderAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (facilityId && orderId) setAudit(await getAdminFacilityOrder(accessToken, facilityId, orderId));
      else if (facilityId) setFacility(await getAdminFacility(accessToken, facilityId));
      else setOverview(await listAdminFacilities(accessToken));
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Facility oversight unavailable.');}
    finally {setLoading(false);}
  }, [accessToken, facilityId, orderId]);
  useEffect(() => {load();}, [load]);
  const summary = (item: FacilityDetail['summary']) => <View key={item.id} style={styles.card}>
    <Text style={styles.bold}>{item.name} · {item.isActive ? 'Active' : 'Inactive'}</Text>
    <Text>{item.address || 'Address unavailable'}</Text>
    <Text>Workload {item.workload} · Received {item.received} · Verification {item.verification}</Text>
    <Text>Open discrepancies {item.openDiscrepancies} · QC failures {item.qcFailures} · Rewash cycles {item.rewashCycles}</Text>
    <Text>Wash {item.stages.washing || 0} · Dry {item.stages.drying || 0} · Iron {item.stages.ironing || 0} · Fold {item.stages.folding || 0} · Pack-prep {item.stages.packaging || 0}</Text>
    <Text>Packed {item.packed} · Ready for delivery {item.ready}</Text>
    <Text>Age warnings {item.ageWarnings} · Stuck {item.stuckOrders} · Oldest active {item.oldestActiveHours}h</Text>
    <Text>Active staff {item.activeStaff} · Active machines {item.activeMachines} · Installed machine capacity {item.installedMachineCapacityKg} kg</Text>
    {onFacility ? <TouchableOpacity accessibilityRole="button" onPress={() => onFacility(item.id)}><Text style={styles.link}>View Facility orders</Text></TouchableOpacity> : null}
  </View>;
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Back</Text></TouchableOpacity>
    <Text style={styles.title}>{orderId ? 'Facility order history' : facilityId ? 'Facility workload' : 'Facility oversight'}</Text>
    <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.link}>Refresh oversight</Text></TouchableOpacity>
    {loading ? <ActivityIndicator accessibilityLabel="Loading Facility oversight" /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {error ? <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.link}>Retry oversight</Text></TouchableOpacity> : null}
    {overview ? <>
      <Text>Monitoring indicators: warning after {overview.monitoring.ageWarningHours}h, stuck after {overview.monitoring.stuckHours}h since last order update. These are not contractual SLAs.</Text>
      {overview.facilities.length ? overview.facilities.map(summary) : <Text>No facilities found.</Text>}
    </> : null}
    {facility ? <>
      {summary(facility.summary)}
      <Text style={styles.heading}>Orders</Text>
      {facility.orders.length ? facility.orders.map(item => <View key={item.id} style={styles.card}>
        <Text style={styles.bold}>{item.order_number} · {label(item.current_status)}</Text>
        <Text>Latest stage {item.latestStage ? label(item.latestStage) : 'None'} · Age {item.processingAgeHours}h</Text>
        <Text>{item.stuck ? 'Stuck order' : item.ageWarning ? 'Age warning' : 'On track'} · Open discrepancies {item.openDiscrepancies}</Text>
        <Text>Updated {date(item.updated_at)}</Text>
        {onOrder ? <TouchableOpacity accessibilityRole="button" onPress={() => onOrder(facility.summary.id, item.id)}><Text style={styles.link}>View processing history</Text></TouchableOpacity> : null}
      </View>) : <Text>No orders at this Facility.</Text>}
    </> : null}
    {audit ? <>
      <Text style={styles.heading}>{audit.order.order_number} · {label(audit.order.current_status)}</Text>
      <Text>Processing history</Text>
      {audit.operations.length ? audit.operations.map(item => <Text key={item.id}>{label(item.operation_type || 'receipt')} · {item.completed_at ? 'completed' : label(item.current_status || 'recorded')} · cycle {item.rewash_cycle} · {date(item.started_at || item.completed_at)}</Text>) : <Text>No processing records.</Text>}
      <Text style={styles.heading}>Intake and discrepancies</Text>
      <Text>{audit.inspections.length} garment verification records</Text>
      {audit.discrepancies.length ? audit.discrepancies.map(item => <Text key={item.id}>{label(item.kind)} · {item.status} · {item.notes}{item.resolution_notes ? ` · ${item.resolution_notes}` : ''}</Text>) : <Text>No discrepancies.</Text>}
      <Text style={styles.heading}>QC and packing</Text>
      {audit.qc.length ? audit.qc.map(item => <Text key={item.id}>Cycle {item.cycle_number} · {item.approved ? 'Passed' : `Failed: ${item.defect_code || ''} ${item.reason || ''}`}</Text>) : <Text>No QC decisions.</Text>}
      {audit.packings.length ? audit.packings.map(item => <Text key={item.id}>Parcel {item.parcel_id} · {date(item.packed_at)}</Text>) : <Text>No packing record.</Text>}
      <Text style={styles.heading}>QR intake audit</Text>
      {audit.qr.flatMap(item => item.scans).length ? audit.qr.flatMap(item => item.scans).map(item => <Text key={item.id}>{label(item.scan_action)} · {date(item.scanned_at)}</Text>) : <Text>No QR scans.</Text>}
      <Text style={styles.heading}>Order timeline</Text>
      {audit.history.length ? audit.history.map(item => <Text key={item.id}>{label(item.from_status || 'start')} → {label(item.to_status)} · {date(item.created_at)}</Text>) : <Text>No status history.</Text>}
    </> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#fff'}, content: {padding: 20, gap: 12}, title: {fontSize: 25, fontWeight: '700'}, heading: {fontSize: 19, fontWeight: '700'}, card: {padding: 14, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, gap: 5}, bold: {fontWeight: '700'}, link: {fontWeight: '700'}, error: {color: '#a11'}});
