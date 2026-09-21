import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {FacilityIntakeDetails, IntakeItem, ItemMeasurement, getFacilityIntake, resolveFacilityDiscrepancy, verifyFacilityIntake} from '../services/facilityVerificationApi';
import FacilityProcessingPanel from './FacilityProcessingPanel';
import FacilityPackingPanel from './FacilityPackingPanel';

type Props = {accessToken: string; orderId: string; onBack: () => void; onChanged: () => void};
type Entry = {quantity: string; weight: string; damaged: boolean; notes: string};

function initialEntries(items: IntakeItem[]): Record<string, Entry> {
  return Object.fromEntries(items.map(item => [item.id, {
    quantity: String(item.quantity), weight: item.weight_kg == null ? '' : String(item.weight_kg),
    damaged: false, notes: '',
  }]));
}

export default function FacilityVerificationScreen({accessToken, orderId, onBack, onChanged}: Props) {
  const [detail, setDetail] = useState<FacilityIntakeDetails | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [overallNotes, setOverallNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [packingReady, setPackingReady] = useState(false);
  const [workflowRefresh, setWorkflowRefresh] = useState(0);
  const lock = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await getFacilityIntake(accessToken, orderId);
      setDetail(result);
      if (result.orderStatus === 'received_at_facility') setEntries(initialEntries(result.items));
    } catch (cause) {setDetail(null); setError(cause instanceof Error ? cause.message : 'Garment verification unavailable.');}
    finally {setLoading(false);}
  }, [accessToken, orderId]);
  useEffect(() => {load();}, [load]);
  const edit = (id: string, patch: Partial<Entry>) => setEntries(current => ({...current, [id]: {...current[id], ...patch}}));
  const submit = async () => {
    if (lock.current || !detail) return;
    setError(''); setMessage('');
    const items: ItemMeasurement[] = [];
    for (const item of detail.items) {
      const entry = entries[item.id];
      const quantity = Number(entry?.quantity);
      const weight = entry?.weight.trim() ? Number(entry.weight) : null;
      if (!entry || !Number.isInteger(quantity) || quantity < 0 || (weight !== null && (!Number.isFinite(weight) || weight < 0))) {
        setError('Enter a valid measured count and weight for every item.'); return;
      }
      const differentWeight = item.weight_kg != null && weight !== Number(item.weight_kg);
      if ((quantity !== item.quantity || differentWeight || entry.damaged) && !entry.notes.trim()) {
        setError(`Add discrepancy notes for ${item.item_name}.`); return;
      }
      items.push({orderItemId: item.id, countedQuantity: quantity, weightKg: weight,
        damaged: entry.damaged, notes: entry.notes.trim()});
    }
    if (!items.length) {setError('No garment items are available to verify.'); return;}
    lock.current = true; setBusy(true);
    try {
      const result = await verifyFacilityIntake(accessToken, orderId, items, overallNotes.trim());
      setMessage(result.discrepancyCount ?
        `Verification saved with ${result.discrepancyCount} open discrepancy records. Manager resolution is required before processing.` :
        'Garment verification saved.');
      onChanged(); await load();
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Unable to save garment verification.');}
    finally {lock.current = false; setBusy(false);}
  };
  const resolve = async (id: string) => {
    if (lock.current) return;
    const notes = resolutionNotes[id]?.trim();
    if (!notes) {setError('Resolution notes are required.'); return;}
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await resolveFacilityDiscrepancy(accessToken, orderId, id, notes);
      setMessage('Discrepancy resolved and retained in the intake history.');
      onChanged(); await load();
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Unable to resolve discrepancy.');}
    finally {lock.current = false; setBusy(false);}
  };
  const openCount = detail?.discrepancies.filter(item => item.status === 'open').length ?? 0;
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Back</Text></TouchableOpacity>
    <Text style={styles.eyebrow}>ORDER WORKFLOW</Text><Text style={styles.title}>Garment verification</Text>
    {loading ? <ActivityIndicator accessibilityLabel="Loading garment verification" /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {error ? <TouchableOpacity accessibilityRole="button" onPress={() => {load();}}><Text style={styles.link}>Retry verification</Text></TouchableOpacity> : null}
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    {detail ? <>
      <Text style={styles.heading}>Order {detail.orderNumber}</Text>
      <Text>{detail.facility.name} · {detail.orderStatus.replace(/_/g, ' ')}</Text>
      {detail.orderStatus === 'received_at_facility' ? <>
        <View style={styles.instruction}><Text style={styles.instructionTitle}>1. Compare the handoff</Text><Text>Confirm the physical count and weight for each garment. Add notes only when something differs or is damaged.</Text></View>
        {detail.items.length ? detail.items.map(item => {
          const entry = entries[item.id];
          return <View key={item.id} style={styles.card}>
            <Text style={styles.heading}>{item.item_name}</Text>
            <Text style={styles.expected}>Expected: {item.quantity} item{item.quantity === 1 ? '' : 's'}{item.weight_kg == null ? '' : ` · ${item.weight_kg} kg`}</Text>
            <Text style={styles.fieldLabel}>Count received</Text>
            <TextInput accessibilityLabel={`Measured count for ${item.item_name}`} keyboardType="number-pad"
              value={entry?.quantity ?? ''} onChangeText={quantity => edit(item.id, {quantity})} style={styles.input} />
            <Text style={styles.fieldLabel}>Weight received</Text><TextInput accessibilityLabel={`Measured weight for ${item.item_name}`} keyboardType="decimal-pad"
              value={entry?.weight ?? ''} onChangeText={weight => edit(item.id, {weight})}
              placeholder="Measured kg, if applicable" style={styles.input} />
            <TouchableOpacity accessibilityRole="button" onPress={() => edit(item.id, {damaged: !entry?.damaged})}>
              <Text style={styles.link}>{entry?.damaged ? 'Damaged at receipt: Yes' : 'Damaged at receipt: No'}</Text>
            </TouchableOpacity>
            <TextInput accessibilityLabel={`Discrepancy notes for ${item.item_name}`} value={entry?.notes ?? ''}
              onChangeText={notes => edit(item.id, {notes})} placeholder="Notes for missing, extra, damaged or weight mismatch"
              multiline style={styles.input} />
          </View>;
        }) : <Text>No garments are listed for this order.</Text>}
        <TextInput accessibilityLabel="Overall verification notes" value={overallNotes} onChangeText={setOverallNotes}
          placeholder="Overall intake notes (optional)" multiline style={styles.input} />
        <TouchableOpacity accessibilityRole="button" disabled={busy || !detail.items.length} onPress={() => {submit();}}>
          <Text style={styles.link}>Save garment verification</Text>
        </TouchableOpacity>
      </> : null}
      {detail.inspections.length ? <Text>Measured item records: {detail.inspections.length}</Text> : null}
      <Text style={styles.heading}>Intake discrepancies · {openCount} open</Text>
      {detail.discrepancies.length ? detail.discrepancies.map(discrepancy => <View key={discrepancy.id} style={styles.card}>
        <Text>{discrepancy.kind.replace(/_/g, ' ')} · {discrepancy.status}</Text>
        <Text>Listed {discrepancy.expected_quantity}; counted {discrepancy.counted_quantity}</Text>
        <Text>{discrepancy.notes}</Text>
        {discrepancy.status === 'resolved' ? <Text>Resolution: {discrepancy.resolution_notes}</Text> : null}
        {discrepancy.status === 'open' && detail.role === 'manager' ? <>
          <TextInput accessibilityLabel={`Resolution notes for ${discrepancy.kind}`} value={resolutionNotes[discrepancy.id] ?? ''}
            onChangeText={notes => setResolutionNotes(current => ({...current, [discrepancy.id]: notes}))}
            placeholder="Resolution notes" multiline style={styles.input} />
          <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => {resolve(discrepancy.id);}}>
            <Text style={styles.link}>Resolve discrepancy</Text>
          </TouchableOpacity>
        </> : null}
      </View>) : <Text>No intake discrepancies recorded.</Text>}
      {openCount ? <View style={styles.discrepancyAlert}><Text style={styles.alertTitle}>Action required</Text><Text accessibilityRole="alert">Processing is blocked until every intake discrepancy is resolved.</Text></View> : null}
      {['verification', 'processing', 'rework_required', 'ready_for_delivery', 'quality_check'].includes(detail.orderStatus) ?
        <>
          <FacilityPackingPanel key={`pack-${workflowRefresh}`} accessToken={accessToken} orderId={orderId}
            onReadiness={setPackingReady} onChanged={() => {onChanged(); load(); setWorkflowRefresh(value => value + 1);}} />
          <FacilityProcessingPanel key={`process-${workflowRefresh}`} accessToken={accessToken} orderId={orderId}
            items={detail.items} packingReady={packingReady}
            onChanged={() => {onChanged(); load(); setPackingReady(false); setWorkflowRefresh(value => value + 1);}} />
        </> : null}
    </> : !loading && !error ? <Text>Order intake data unavailable.</Text> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#F7F6F2'}, content: {padding: 18, gap: 14, paddingBottom: 38}, eyebrow: {fontSize: 11, letterSpacing: 1.4, fontWeight: '800', color: '#67635B'}, title: {fontSize: 30, fontWeight: '900'}, heading: {fontSize: 18, fontWeight: '900'}, instruction: {backgroundColor: '#E8EEF8', borderRadius: 15, padding: 14, gap: 5}, instructionTitle: {fontWeight: '900', fontSize: 16}, expected: {backgroundColor: '#F1EEE7', borderRadius: 10, padding: 10, fontWeight: '800'}, fieldLabel: {fontSize: 12, fontWeight: '800', color: '#67635B'}, card: {borderWidth: 1, borderColor: '#E2DED6', backgroundColor: '#fff', borderRadius: 17, padding: 15, gap: 9}, input: {borderWidth: 1, borderColor: '#CFCAC0', backgroundColor: '#fff', borderRadius: 11, padding: 11}, discrepancyAlert: {backgroundColor: '#FFF1CF', borderWidth: 1, borderColor: '#E6C46A', borderRadius: 14, padding: 14, gap: 4}, alertTitle: {fontWeight: '900'}, link: {fontWeight: '900'}, error: {color: '#9A241E'}});
