import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {FacilityChoice, StaffRecord, StaffRole, listAdminFacilities, listAdminStaff, provisionAdminStaff} from '../services/adminStaffApi';

type Props = {accessToken: string; onBack: () => void; onStaff: (profileId: string) => void};
export default function AdminStaffScreen({accessToken, onBack, onStaff}: Props) {
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [facilities, setFacilities] = useState<FacilityChoice[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [applied, setApplied] = useState({search: '', role: '', status: ''});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('driver');
  const [facilityId, setFacilityId] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [people, places] = await Promise.all([
        listAdminStaff(accessToken, applied), listAdminFacilities(accessToken),
      ]);
      setStaff(people); setFacilities(places.filter(place => place.is_active));
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Staff unavailable.');}
    finally {setLoading(false);}
  }, [accessToken, applied]);
  useEffect(() => {load();}, [load]);
  const create = async () => {
    if (saving) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await provisionAdminStaff(accessToken, {phone, fullName, role: newRole, facilityId});
      setPhone(''); setFullName(''); setFacilityId('');
      await load(); setSuccess('Staff account created. Login uses the Development OTP.');
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Unable to create staff.');}
    finally {setSaving(false);}
  };
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Admin dashboard</Text></TouchableOpacity>
    <Text style={styles.title}>Driver and Facility staff</Text>
    <TextInput accessibilityLabel="Search staff" placeholder="Name or phone" value={search} onChangeText={setSearch} style={styles.input} />
    <Text>Role filter</Text><View style={styles.row}>{(['', 'driver', 'manager', 'facility_employee'] as const).map(value =>
      <TouchableOpacity key={value} accessibilityRole="button" onPress={() => setRoleFilter(value)}><Text style={value === roleFilter ? styles.selected : styles.link}>{value || 'All'}</Text></TouchableOpacity>)}</View>
    <Text>Status filter</Text><View style={styles.row}>{['', 'active', 'inactive'].map(value =>
      <TouchableOpacity key={value} accessibilityRole="button" onPress={() => setStatusFilter(value)}><Text style={value === statusFilter ? styles.selected : styles.link}>{value || 'All'}</Text></TouchableOpacity>)}</View>
    <TouchableOpacity accessibilityRole="button" onPress={() => setApplied({search, role: roleFilter, status: statusFilter})}><Text style={styles.link}>Search staff</Text></TouchableOpacity>
    {loading ? <ActivityIndicator accessibilityLabel="Loading staff" /> : null}
    {error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => {load();}}><Text style={styles.link}>Retry staff</Text></TouchableOpacity></> : null}
    {success ? <Text accessibilityRole="alert">{success}</Text> : null}
    {!loading && !error && !staff.length ? <Text>No staff found.</Text> : null}
    {!loading && !error ? staff.map(person => <TouchableOpacity key={person.profile_id} accessibilityRole="button" style={styles.card} onPress={() => onStaff(person.profile_id)}>
      <Text style={styles.bold}>{person.profiles?.full_name || 'Staff'}</Text>
      <Text>{person.role.replace(/_/g, ' ')} · {person.profiles?.is_active ? 'Active' : 'Disabled'}</Text>
      <Text>{person.facilities?.name || 'No assigned facility'}</Text>
    </TouchableOpacity>) : null}
    <Text style={styles.heading}>Create staff account</Text>
    <TextInput accessibilityLabel="Staff name" placeholder="Full name" value={fullName} onChangeText={setFullName} style={styles.input} />
    <TextInput accessibilityLabel="Staff phone" placeholder="+1…" keyboardType="phone-pad" value={phone} onChangeText={setPhone} style={styles.input} />
    <Text>Role</Text><View style={styles.row}>{(['driver', 'manager', 'facility_employee'] as const).map(value =>
      <TouchableOpacity key={value} accessibilityRole="button" onPress={() => setNewRole(value)}><Text style={value === newRole ? styles.selected : styles.link}>{value.replace(/_/g, ' ')}</Text></TouchableOpacity>)}</View>
    {newRole !== 'driver' ? <><Text>Facility</Text>{facilities.length ? facilities.map(place =>
      <TouchableOpacity key={place.id} accessibilityRole="button" onPress={() => setFacilityId(place.id)}><Text style={place.id === facilityId ? styles.selected : styles.link}>{place.name}</Text></TouchableOpacity>) : <Text>No active facilities available.</Text>}</> : null}
    <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={create}><Text style={styles.link}>{saving ? 'Creating…' : 'Create staff'}</Text></TouchableOpacity>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#fff'}, content: {padding: 20, gap: 12}, title: {fontSize: 25, fontWeight: '700'}, heading: {fontSize: 19, fontWeight: '700'}, input: {padding: 12, borderWidth: 1, borderColor: '#bbb', borderRadius: 8}, row: {flexDirection: 'row', flexWrap: 'wrap', gap: 12}, selected: {fontWeight: '700', color: '#116'}, link: {fontWeight: '700'}, card: {padding: 14, borderWidth: 1, borderColor: '#ddd', borderRadius: 10}, bold: {fontWeight: '700'}, error: {color: '#a11'}});
