import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {getCustomerProfile, updateCustomerName, validateName} from '../services/profileApi';
import type {CustomerRecord} from '../services/profileApi';

type Props = {accessToken: string; onBack: () => void; onAddresses: () => void; onLogout: () => Promise<void>};
export default function ProfileScreen({accessToken, onBack, onAddresses, onLogout}: Props) {
  const [record, setRecord] = useState<CustomerRecord | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {const result = await getCustomerProfile(accessToken); setRecord(result); setName(result.profiles?.full_name ?? '');}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Profile unavailable.');}
    finally {setLoading(false);}
  }, [accessToken]);
  useEffect(() => {load();}, [load]);
  const save = async () => {
    const issue = validateName(name);
    if (issue) {setError(issue); return;}
    setSaving(true); setError(''); setSuccess('');
    try {const updated = await updateCustomerName(accessToken, name); setRecord(current => current ? {...current, profiles: updated} : current); setSuccess('Profile saved.');}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Unable to save profile.');}
    finally {setSaving(false);}
  };
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity onPress={onBack}><Text style={styles.link}>← Back</Text></TouchableOpacity>
    <Text style={styles.title}>Your profile</Text>
    {loading ? <ActivityIndicator accessibilityLabel="Loading profile" /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {success ? <Text accessibilityRole="alert">{success}</Text> : null}
    {!record && !loading ? <TouchableOpacity onPress={() => {load();}}><Text style={styles.link}>Retry</Text></TouchableOpacity> : null}
    {record ? <>
      <Text style={styles.label}>Name</Text><TextInput accessibilityLabel="Full name" style={styles.input} value={name} onChangeText={setName} maxLength={150} autoCapitalize="words" />
      <TouchableOpacity style={styles.button} disabled={saving} onPress={() => {save();}}><Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save name'}</Text></TouchableOpacity>
      <View style={styles.card}><Text style={styles.label}>Verified phone</Text><Text>{record.profiles?.phone || 'Unavailable'}</Text><Text>Phone changes require a new verified login.</Text></View>
      <View style={styles.card}><Text style={styles.label}>Email</Text><Text>No email is saved for this account.</Text></View>
      <TouchableOpacity onPress={onAddresses} style={styles.card}><Text style={styles.link}>Manage saved addresses →</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => Alert.alert('Log out?', 'You will need to verify your phone to sign in again.', [{text: 'Stay'}, {text: 'Log out', onPress: () => {onLogout();}}])}><Text style={styles.link}>Log out</Text></TouchableOpacity>
    </> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#fff'}, content: {padding: 20, gap: 14}, title: {fontSize: 24, fontWeight: '700'}, label: {fontWeight: '700'}, input: {borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 12}, button: {backgroundColor: '#111', borderRadius: 10, padding: 14}, buttonText: {color: '#fff', textAlign: 'center', fontWeight: '700'}, card: {borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, gap: 7}, link: {fontWeight: '700'}, error: {color: '#a11'}});
