import React, {useCallback, useEffect, useState} from 'react';
import {NativeModules, Platform, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {CustomerNotification, getNotifications, markNotificationRead, notificationOrderId} from '../services/notificationsApi';

type Props = {accessToken: string; onBack: () => void; onOpenOrder: (orderId: string) => void};

export default function NotificationsScreen({accessToken, onBack, onOpenOrder}: Props) {
  const [items, setItems] = useState<CustomerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);

  const requestIosPermission = async () => {
    setPermissionBusy(true);
    setPermissionMessage(null);
    try {
      const granted = await NativeModules.BWNotificationPermission?.requestPermission?.();
      if (typeof granted !== 'boolean') throw new Error('Notification permission is unavailable.');
      setPermissionMessage(granted ? 'iPhone alerts are allowed.' : 'iPhone alerts are off. You can change this in Settings.');
    } catch {
      setPermissionMessage('Unable to request iPhone alerts. Please try again.');
    } finally {
      setPermissionBusy(false);
    }
  };

  const load = useCallback(async (refresh = false) => {
    try {
      refresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      setItems(await getNotifications(accessToken));
    } catch (loadError: any) {
      setError(loadError?.message || 'Notifications are temporarily unavailable.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  const open = async (item: CustomerNotification) => {
    if (!item.is_read) {
      try {
        const updated = await markNotificationRead(accessToken, item.id);
        setItems(current => current.map(value => value.id === item.id ? updated : value));
      } catch {
        setItems(current => current.map(value => value.id === item.id ? {...value, is_read: true} : value));
      }
    }
    const orderId = notificationOrderId(item);
    if (orderId) onOpenOrder(orderId);
  };

  return <SafeAreaView style={styles.container}>
    <View style={styles.header}><TouchableOpacity onPress={onBack}><Text style={styles.back}>← Back</Text></TouchableOpacity><Text style={styles.title}>Notifications</Text><View style={styles.spacer} /></View>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
      {Platform.OS === 'ios' ? <View style={styles.permissionCard}>
        <Text style={styles.itemTitle}>Order alerts</Text>
        <TouchableOpacity accessibilityRole="button" disabled={permissionBusy} onPress={requestIosPermission}>
          <Text style={styles.permissionButton}>{permissionBusy ? 'Checking permission...' : 'Enable iPhone alerts'}</Text>
        </TouchableOpacity>
        {permissionMessage ? <Text accessibilityRole="alert" style={styles.message}>{permissionMessage}</Text> : null}
      </View> : null}
      {loading ? <Text style={styles.message}>Loading notifications...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading && !error && items.length === 0 ? <Text style={styles.message}>You have no notifications yet.</Text> : null}
      {items.map(item => <TouchableOpacity key={item.id} style={[styles.item, !item.is_read && styles.unread]} onPress={() => open(item)}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.itemBody}>{item.body || item.message || 'Order update'}</Text>
        <Text style={styles.itemDate}>{new Date(item.created_at).toLocaleString('en-IN')}</Text>
      </TouchableOpacity>)}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#FFFFFF'}, header: {height: 65, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, back: {fontWeight: '700'}, title: {fontSize: 18, fontWeight: '800'}, spacer: {width: 42}, content: {padding: 20, gap: 12}, item: {borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 14, padding: 15}, unread: {backgroundColor: '#F3F0EA', borderColor: '#111111'}, itemTitle: {fontSize: 15, fontWeight: '800'}, itemBody: {marginTop: 5, fontSize: 13, color: '#555555', lineHeight: 19}, itemDate: {marginTop: 8, fontSize: 11, color: '#777777'}, message: {textAlign: 'center', color: '#666666', marginTop: 12}, error: {color: '#B42318', textAlign: 'center', marginTop: 40}, permissionCard: {borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 14, padding: 15}, permissionButton: {marginTop: 10, fontWeight: '700', color: '#111111'},
});
