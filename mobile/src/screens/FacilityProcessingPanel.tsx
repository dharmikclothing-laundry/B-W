import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {ProcessingHistory, ProcessingStage, completeFacilityStage, getFacilityProcessing, recordFacilityQualityDecision, startFacilityStage} from '../services/facilityProcessingApi';

const labels: Record<ProcessingStage, string> = {washing: 'Wash', drying: 'Dry', ironing: 'Iron', folding: 'Fold', packaging: 'Pack'};
const workflow = ['Wash', 'Dry', 'Iron', 'Fold', 'QC', 'Pack'] as const;
type Props = {accessToken: string; orderId: string; onChanged: () => void;
  items?: Array<{id: string; item_name: string}>; packingReady?: boolean};
export default function FacilityProcessingPanel({accessToken, orderId, onChanged, items = [], packingReady = true}: Props) {
  const [history, setHistory] = useState<ProcessingHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [defectCode, setDefectCode] = useState('');
  const [affectedItemIds, setAffectedItemIds] = useState<string[]>([]);
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {setHistory(await getFacilityProcessing(accessToken, orderId));}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Processing history unavailable.');}
    finally {setLoading(false);}
  }, [accessToken, orderId]);
  useEffect(() => {refresh();}, [refresh]);
  const act = async (action: () => Promise<unknown>, success: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {await action(); setMessage(success); await refresh(); onChanged();}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Processing action failed.');}
    finally {lock.current = false; setBusy(false);}
  };
  const decide = (approved: boolean) => {
    if (approved && (history?.rewashCycle ?? 0) >= 2 && reason.trim().length < 5) {
      setError('Manager reconciliation notes are required after two rewash cycles.'); return;
    }
    if (!approved && (!defectCode || reason.trim().length < 5)) {
      setError('Choose a defect and enter a reason of at least 5 characters.'); return;
    }
    act(() => recordFacilityQualityDecision(accessToken, orderId, {
      approved, notes: reason.trim(), defectCode: approved ? undefined : defectCode,
      affectedItemIds: approved ? [] : affectedItemIds,
    }), approved ? 'QC passed. Order is ready for delivery.' : 'QC failed. Rewash is required.');
  };
  const stepState = (label: typeof workflow[number]) => {
    const stageType: Record<string, ProcessingStage> = {Wash: 'washing', Dry: 'drying', Iron: 'ironing', Fold: 'folding', Pack: 'packaging'};
    if (label === 'QC') return history?.qualityDecisions?.some(item => item.approved) ? 'complete' : history?.canQualityCheck ? 'active' : 'waiting';
    if (label === 'Pack' && packingReady) return 'complete';
    const stage = history?.stages.filter(item => item.operation_type === stageType[label]).at(-1);
    if (stage?.completed_at) return 'complete';
    if (stage || history?.nextStage === stageType[label]) return 'active';
    return 'waiting';
  };
  return <View style={styles.panel}>
    <Text style={styles.heading}>Processing workflow</Text>
    <View style={styles.stepper}>{workflow.map((label, index) => {const state = stepState(label); return <React.Fragment key={label}><View style={styles.stepWrap}><View style={[styles.stepDot, state === 'complete' && styles.stepComplete, state === 'active' && styles.stepActive]}><Text style={[styles.stepNumber, state !== 'waiting' && styles.stepNumberActive]}>{state === 'complete' ? '✓' : index + 1}</Text></View><Text style={[styles.stepLabel, state === 'active' && styles.stepLabelActive]}>{label}</Text></View>{index < workflow.length - 1 ? <View style={styles.connector} /> : null}</React.Fragment>;})}</View>
    {loading ? <ActivityIndicator accessibilityLabel="Loading processing history" /> : null}
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    {error ? <TouchableOpacity accessibilityRole="button" onPress={() => {refresh();}}><Text>Retry processing</Text></TouchableOpacity> : null}
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    {history?.openDiscrepancies ? <View style={styles.blockAlert}><Text style={styles.alertTitle}>Processing paused</Text><Text accessibilityRole="alert">Resolve all intake discrepancies before processing.</Text></View> : null}
    {history && !history.stages.length ? <Text>No processing stages recorded yet.</Text> : null}
    {history?.stages.map(stage => <View key={stage.id}>
      <Text>Cycle {stage.rewash_cycle ?? 0} · {labels[stage.operation_type]} · {stage.completed_at ? 'Completed' : 'In progress'}</Text>
      <Text>Started: {stage.started_at}</Text>
      {stage.completed_at ? <Text>Completed: {stage.completed_at}</Text> : null}
      {stage.completed_at || history.orderStatus !== 'processing' ? null : <TouchableOpacity accessibilityRole="button" disabled={busy}
        onPress={() => {act(() => completeFacilityStage(accessToken, stage.id), `${labels[stage.operation_type]} completed.`);}}>
        <Text>Complete {labels[stage.operation_type]}</Text>
      </TouchableOpacity>}
    </View>)}
    {history?.nextStage && !history.openDiscrepancies ? <TouchableOpacity accessibilityRole="button" disabled={busy}
      onPress={() => {act(() => startFacilityStage(accessToken, orderId, history.nextStage!), `${labels[history.nextStage!]} started.`);}}>
      <Text>Start {labels[history.nextStage]}</Text>
    </TouchableOpacity> : null}
    {history?.qualityDecisions?.length ? <Text style={styles.heading}>QC history</Text> : null}
    {history?.qualityDecisions?.map(decision => <View key={decision.id}>
      <Text>Cycle {decision.cycle_number} · {decision.approved ? 'Passed' : 'Failed — rewash required'}</Text>
      <Text>{decision.created_at}</Text>
      {decision.defect_code ? <Text>Defect: {decision.defect_code}</Text> : null}
      {decision.reason ? <Text>Reason: {decision.reason}</Text> : null}
      {decision.affected_item_ids.length ? <Text>Affected items: {decision.affected_item_ids.length}</Text> : <Text>Applies to whole order</Text>}
    </View>)}
    {history?.canQualityCheck ? <View style={styles.panel}>
      <View style={styles.qcHeader}><Text style={styles.heading}>Quality inspection</Text><Text style={styles.cycle}>Cycle {history.rewashCycle ?? 0}</Text></View>
      <TextInput accessibilityLabel="QC reason" value={reason} onChangeText={setReason}
        placeholder="Defect or inspection notes" multiline style={styles.input} />
      <Text>For a failed inspection, select one defect:</Text>
      {['stain', 'damage', 'finish', 'missing', 'other'].map(code =>
        <TouchableOpacity key={code} accessibilityRole="button" onPress={() => setDefectCode(code)}>
          <Text>{defectCode === code ? '●' : '○'} {code}</Text>
        </TouchableOpacity>)}
      <Text>Choose affected items, or leave all unchecked for the whole order:</Text>
      {items.map(item => <TouchableOpacity key={item.id} accessibilityRole="button" onPress={() =>
        setAffectedItemIds(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])}>
        <Text>{affectedItemIds.includes(item.id) ? '☑' : '☐'} {item.item_name}</Text>
      </TouchableOpacity>)}
      {!packingReady ? <Text>Confirm final packing before QC can make this order ready.</Text> : null}
      <TouchableOpacity accessibilityRole="button" style={styles.passButton} disabled={busy || !packingReady} onPress={() => decide(true)}><Text style={styles.passText}>Pass QC</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={styles.failButton} disabled={busy || (history.rewashCycle ?? 0) >= 2}
        onPress={() => decide(false)}><Text style={styles.failText}>Fail QC — require rewash</Text></TouchableOpacity>
      {(history.rewashCycle ?? 0) >= 2 ? <Text>Rewash limit reached. Manager reconciliation notes are required for final approval.</Text> : null}
    </View> : null}
    {history?.role === 'facility_employee' && history.orderStatus === 'processing' &&
      history.stages[history.stages.length - 1]?.operation_type === 'packaging' &&
      history.stages[history.stages.length - 1]?.completed_at ?
      <Text>Pack check is complete. A Facility Manager must perform QC.</Text> : null}
    {history?.orderStatus === 'rework_required' ? <Text>QC failed. Start a new washing cycle after reconciliation.</Text> : null}
  </View>;
}
const styles = StyleSheet.create({panel: {gap: 10, paddingVertical: 14}, heading: {fontSize: 19, fontWeight: '900'}, stepper: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginVertical: 8}, stepWrap: {alignItems: 'center', width: 38, gap: 5}, stepDot: {width: 30, height: 30, borderRadius: 15, backgroundColor: '#E4E0D8', alignItems: 'center', justifyContent: 'center'}, stepComplete: {backgroundColor: '#176E47'}, stepActive: {backgroundColor: '#151515'}, stepNumber: {fontWeight: '900', color: '#777'}, stepNumberActive: {color: '#fff'}, stepLabel: {fontSize: 10, fontWeight: '800', color: '#777'}, stepLabelActive: {color: '#151515'}, connector: {height: 2, flex: 1, backgroundColor: '#D7D2C9', marginTop: 14}, blockAlert: {backgroundColor: '#FFF1CF', borderWidth: 1, borderColor: '#E6C46A', borderRadius: 14, padding: 13, gap: 4}, alertTitle: {fontWeight: '900'}, qcHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}, cycle: {fontWeight: '800', color: '#67635B'}, input: {borderWidth: 1, borderColor: '#CFCAC0', borderRadius: 12, padding: 11, backgroundColor: '#fff'}, passButton: {backgroundColor: '#176E47', borderRadius: 13, minHeight: 48, alignItems: 'center', justifyContent: 'center'}, passText: {color: '#fff', fontWeight: '900'}, failButton: {borderColor: '#B94A40', borderWidth: 1, borderRadius: 13, minHeight: 48, alignItems: 'center', justifyContent: 'center'}, failText: {color: '#9A241E', fontWeight: '900'}});
