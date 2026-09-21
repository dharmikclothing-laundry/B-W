import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {AdminReport, AuditPage, ReportFilters, getAdminAudit, getAdminReport} from '../services/adminReportsApi';

type Props = {accessToken: string; onBack: () => void};
const today = new Date();
const initial = {from: new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10),
  to: today.toISOString().slice(0, 10), source: 'all', q: '', limit: 50, offset: 0};
const money = (value: number) => `₹${value.toFixed(2)}`;
const label = (value: string) => value.replace(/_/g, ' ');
const sources = ['all', 'staff', 'assignments', 'catalogue', 'issues', 'growth', 'financial'];

export default function AdminReportsScreen({accessToken, onBack}: Props) {
  const [draft, setDraft] = useState<ReportFilters>(initial);
  const [filters, setFilters] = useState<ReportFilters>(initial);
  const [report, setReport] = useState<AdminReport | null>(null);
  const [audit, setAudit] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError('');
    try {
      const [nextReport, nextAudit] = await Promise.all([getAdminReport(accessToken, filters), getAdminAudit(accessToken, filters)]);
      if (sequence === requestSequence.current) {setReport(nextReport); setAudit(nextAudit);}
    } catch (cause) {if (sequence === requestSequence.current) setError(cause instanceof Error ? cause.message : 'Admin reports unavailable.');}
    finally {if (sequence === requestSequence.current) setLoading(false);}
  }, [accessToken, filters]);
  useEffect(() => {load();}, [load]);
  const apply = () => {requestSequence.current += 1; setReport(null); setAudit(null); setFilters({...draft, offset: 0});};
  const page = (offset: number) => setFilters(current => ({...current, offset}));
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Admin dashboard</Text></TouchableOpacity>
    <Text style={styles.eyebrow}>INSIGHTS</Text><Text style={styles.title}>Analytics & audit</Text>
    <Text>Date range (UTC, maximum 366 days)</Text>
    <View style={styles.row}><TextInput accessibilityLabel="From date" style={styles.input} value={draft.from}
      onChangeText={from => setDraft({...draft, from})} placeholder="YYYY-MM-DD" />
      <TextInput accessibilityLabel="To date" style={styles.input} value={draft.to}
        onChangeText={to => setDraft({...draft, to})} placeholder="YYYY-MM-DD" /></View>
    <TextInput accessibilityLabel="Search audit action, actor or entity" style={styles.input} value={draft.q || ''}
      onChangeText={q => setDraft({...draft, q})} placeholder="Search audit action, actor or entity" />
    <Text>Audit source</Text>
    <View style={styles.wrap}>{sources.map(source => <TouchableOpacity key={source} accessibilityRole="button"
      onPress={() => setDraft({...draft, source})} style={styles.chip}><Text style={styles.link}>{source === draft.source ? '● ' : ''}{label(source)}</Text></TouchableOpacity>)}</View>
    <TouchableOpacity accessibilityRole="button" onPress={apply}><Text style={styles.link}>Apply report filters</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.link}>Refresh reports</Text></TouchableOpacity>
    {loading ? <ActivityIndicator accessibilityLabel="Loading Admin reports" /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {error ? <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.link}>Retry reports</Text></TouchableOpacity> : null}
    {report ? <>
      <Text style={styles.heading}>Revenue and orders · {report.range.from} to {report.range.to}</Text>
      <View style={styles.card}><Text>Gross captured online {money(report.revenue.grossCaptured)}</Text>
        <Text>Completed refunds {money(report.revenue.refunded)}</Text><Text style={styles.bold}>Net captured {money(report.revenue.netCaptured)}</Text>
        <Text>Orders placed {report.orders.created} · Average order value {money(report.orders.averageOrderValue)}</Text>
        <Text>Non-cancelled order value {money(report.orders.nonCancelledValue)}</Text>
        <Text>Cancellations {report.orders.cancellations} · Ready {report.orders.readyForDelivery} · Delivered {report.orders.delivered}</Text>
        <Text>Claims opened {report.claims.created} · Refunds completed {report.refunds.completed}</Text></View>
      <Text style={styles.note}>{report.definitions.revenue} {report.definitions.orderValue}</Text>
      <Text style={styles.heading}>Order trends</Text>
      {report.trend.length ? report.trend.map(item => <View key={item.date} style={styles.trendRow}><View><Text style={styles.bold}>{item.date}</Text><Text>{item.orders} orders · {money(item.orderValue)} order value</Text></View><Text style={styles.trendValue}>{money(item.captured)} captured{item.refunded ? ` · ${money(item.refunded)} refunded` : ''}</Text></View>) : <Text>No activity in this period.</Text>}
      <Text style={styles.heading}>Drivers and facilities</Text>
      <View style={styles.card}><Text>Driver jobs assigned {report.drivers.assigned} · Completed {report.drivers.completed}</Text>
        <Text>Facility receipts {report.facilities.received} · Processing stages completed {report.facilities.completedStages}</Text>
        <Text>Active Facility orders {report.facilities.activeOrders} · Average processing age {report.facilities.averageProcessingAgeHours}h · Over 24h {report.facilities.stuckOver24Hours}</Text></View>
      {report.drivers.byDriver.map((item, index) => <Text key={item.driverId}>Driver {index + 1}: {item.assigned} assigned · {item.accepted} accepted · {item.completed} completed</Text>)}
      {report.facilities.byFacility.map((item, index) => <Text key={item.facilityId}>Facility {index + 1}: {item.received} received · {item.completedStages} stages · {item.activeOrders} active</Text>)}
      <Text style={styles.note}>{report.definitions.processingAge}</Text>
      <Text style={styles.heading}>Growth programs</Text>
      <View style={styles.card}><Text>Coupon uses {report.growth.couponRedemptions} · Discount {money(report.growth.couponDiscount)}</Text>
        <Text>Loyalty earned {report.growth.loyaltyEarnedPoints} points · Redeemed {report.growth.loyaltyRedeemedPoints} points</Text>
        <Text>Packages purchased {report.growth.packagesPurchased} · Uses {report.growth.packageUses} · Units {report.growth.packageUnitsUsed}</Text>
        <Text>Referrals {report.growth.referrals} · Rewards {report.growth.referralRewards}</Text></View>
    </> : null}
    {audit ? <>
      <Text style={styles.heading}>Admin action history · {audit.total} events</Text>
      {audit.events.length ? audit.events.map(item => <View key={`${item.source}-${item.id}`} style={styles.card}>
        <Text style={styles.bold}>{label(item.source)} · {label(item.action)}</Text>
        <Text>{new Date(item.createdAt).toLocaleString('en-IN')}</Text>
        <Text>{item.actorId ? 'Performed by an administrator' : 'Automated system action'}{item.entityId ? ' · Related record available' : ''}</Text>
      </View>) : <Text>No audit events match these filters.</Text>}
      <View style={styles.row}><TouchableOpacity accessibilityRole="button" disabled={audit.offset === 0}
        onPress={() => page(Math.max(0, audit.offset - audit.limit))}><Text style={styles.link}>Previous audit page</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={audit.offset + audit.limit >= audit.total}
          onPress={() => page(audit.offset + audit.limit)}><Text style={styles.link}>Next audit page</Text></TouchableOpacity></View>
    </> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#F7F6F2'}, content: {padding: 18, gap: 12, paddingBottom: 36}, eyebrow: {fontSize: 11, letterSpacing: 1.4, fontWeight: '800', color: '#67635B'}, title: {fontSize: 30, fontWeight: '900'}, heading: {fontSize: 20, fontWeight: '900', marginTop: 6}, card: {padding: 15, borderWidth: 1, borderColor: '#E2DED6', backgroundColor: '#fff', borderRadius: 16, gap: 6}, trendRow: {padding: 14, borderWidth: 1, borderColor: '#E2DED6', backgroundColor: '#fff', borderRadius: 14, gap: 7}, trendValue: {fontWeight: '800', color: '#176E47'}, bold: {fontWeight: '900'}, link: {fontWeight: '900'}, error: {color: '#9A241E'}, note: {color: '#67635B'}, input: {borderWidth: 1, borderColor: '#CFCAC0', backgroundColor: '#fff', borderRadius: 11, padding: 10, flex: 1}, row: {flexDirection: 'row', gap: 8, justifyContent: 'space-between'}, wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8}, chip: {borderWidth: 1, borderColor: '#D7D2C9', backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8}});
