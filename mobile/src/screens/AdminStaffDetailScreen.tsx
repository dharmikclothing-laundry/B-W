import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {activateAdminStaff, deactivateAdminStaff, FacilityChoice, getAdminStaff, listAdminFacilities, reassignAdminStaffFacility, revokeAdminStaffAccess, StaffDetail} from '../services/adminStaffApi';

type Props = {accessToken: string; profileId: string; onBack: () => void};
export default function AdminStaffDetailScreen({accessToken, profileId, onBack}: Props) {
  const [detail, setDetail] = useState<StaffDetail | null>(null);
  const [facilities, setFacilities] = useState<FacilityChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [person, places] = await Promise.all([getAdminStaff(accessToken, profileId), listAdminFacilities(accessToken)]);
      setDetail(person); setFacilities(places.filter(place => place.is_active));
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Staff profile unavailable.');}
    finally {setLoading(false);}
  }, [accessToken, profileId]);
  useEffect(() => {load();}, [load]);
  const change = async (action: 'activate' | 'deactivate' | 'revoke', facilityId?: string) => {
    if (saving) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      if (facilityId) await reassignAdminStaffFacility(accessToken, profileId, facilityId);
      else if (action === 'activate') await activateAdminStaff(accessToken, profileId);
      else if (action === 'revoke') await revokeAdminStaffAccess(accessToken, profileId);
      else await deactivateAdminStaff(accessToken, profileId);
      await load(); setSuccess(facilityId ? 'Facility reassigned.' : action === 'activate' ? 'Staff access restored.' : 'Staff access blocked.');
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Staff action failed.');}
    finally {setSaving(false);}
  };
  const staff = detail?.staff;
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Staff</Text></TouchableOpacity>
    <Text style={styles.title}>Staff profile</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => {load();}}><Text style={styles.link}>Refresh staff</Text></TouchableOpacity>
    {loading ? <ActivityIndicator accessibilityLabel="Loading staff profile" /> : null}
    {error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><TouchableOpacity onPress={() => {load();}}><Text style={styles.link}>Retry profile</Text></TouchableOpacity></> : null}
    {success ? <Text accessibilityRole="alert">{success}</Text> : null}
    {!loading && staff ? <>
      <View style={styles.card}><Text style={styles.bold}>{staff.profiles?.full_name || 'Staff'}</Text>
        <Text>Phone: {staff.profiles?.phone || 'Not provided'}</Text>
        <Text>Role: {staff.role.replace(/_/g, ' ')}</Text>
        <Text>Access: {staff.profiles?.is_active ? 'Active' : 'Disabled'}</Text>
        <Text>Facility: {staff.facilities?.name || 'Not assigned'}</Text>
        {staff.role === 'driver' ? <Text>Availability: {staff.is_available ? 'Available' : 'Unavailable'}</Text> : null}
      </View>
      {staff.profiles?.is_active ? <>
        <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => {change('deactivate');}}><Text style={styles.link}>Deactivate staff</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => {change('revoke');}}><Text style={styles.link}>Revoke access and require Admin re-enable</Text></TouchableOpacity>
      </> : <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => {change('activate');}}><Text style={styles.link}>Re-enable staff</Text></TouchableOpacity>}
      {staff.role !== 'driver' ? <><Text style={styles.heading}>Reassign facility</Text>
        {facilities.filter(place => place.id !== staff.facility_id).length ? facilities.filter(place => place.id !== staff.facility_id).map(place =>
          <TouchableOpacity key={place.id} accessibilityRole="button" disabled={saving} onPress={() => {change('deactivate', place.id);}}><Text style={styles.link}>Move to {place.name}</Text></TouchableOpacity>) : <Text>No other active facility.</Text>}
      </> : null}
      <Text style={styles.heading}>Workload and history</Text>
      {detail?.workload.length ? detail.workload.map(item => <Text key={item.id}>Order {item.order_id} · {item.status || item.current_status || 'Recorded'}</Text>) : <Text>No assignments or Facility operations yet.</Text>}
      <Text style={styles.heading}>Admin action audit</Text>
      {detail?.audit.length ? detail.audit.map(item => <Text key={item.id}>{item.action.replace(/_/g, ' ')} · {new Date(item.created_at).toLocaleString('en-IN')}</Text>) : <Text>No Admin actions recorded.</Text>}
    </> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#fff'}, content: {padding: 20, gap: 12}, title: {fontSize: 25, fontWeight: '700'}, heading: {fontSize: 19, fontWeight: '700'}, card: {padding: 14, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, gap: 6}, bold: {fontWeight: '700'}, link: {fontWeight: '700'}, error: {color: '#a11'}});
