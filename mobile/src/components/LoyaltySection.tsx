import React, {useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {getLoyaltyInfo} from '../services/growthApi';
import {formatMoney} from '../utils/orderPricing';

type Props = {
  accessToken: string;
  subtotalAfterCoupon: number;
  points: number;
  onChange: (points: number) => void;
  onRateChange?: (pointsPerRupee: number) => void;
};

export default function LoyaltySection({accessToken, subtotalAfterCoupon, points, onChange, onRateChange}: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  const [pointsPerRupee, setPointsPerRupee] = useState(10);
  const [minimumRupees, setMinimumRupees] = useState(100);
  const [input, setInput] = useState(points ? String(points) : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    getLoyaltyInfo(accessToken).then(result => {if (active) {
      setBalance(result.balance);
      if (result.rules) {
        const rate = Number(result.rules.loyalty_points_per_rupee);
        setPointsPerRupee(rate); setMinimumRupees(Number(result.rules.loyalty_minimum_redemption_rupees));
        onRateChange?.(rate);
      }
    }})
      .catch(() => {if (active) setError('Loyalty balance is unavailable.');})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [accessToken, onRateChange]);
  const apply = () => {
    const requested = Number(input);
    if (!Number.isSafeInteger(requested) || requested < Math.ceil(minimumRupees * pointsPerRupee)) {
      setError(`Redeem at least ${Math.ceil(minimumRupees * pointsPerRupee).toLocaleString('en-IN')} points (₹${minimumRupees}).`); return;
    }
    if (balance == null || requested > balance) {setError('Insufficient loyalty points.'); return;}
    if (requested > Math.round(subtotalAfterCoupon * pointsPerRupee)) {setError('Points exceed the remaining service price.'); return;}
    setError('');
    onChange(requested);
  };
  return <View style={styles.card}>
    <Text style={styles.title}>Loyalty points</Text>
    {loading ? <ActivityIndicator accessibilityLabel="Loading loyalty balance" /> :
      balance == null ? <Text>Balance unavailable.</Text> : <Text>Available: {balance} points · {pointsPerRupee} points = ₹1 · Minimum {Math.ceil(minimumRupees * pointsPerRupee).toLocaleString('en-IN')} points (₹{minimumRupees})</Text>}
    {points > 0 ? <View>
      <Text accessibilityLabel="Applied loyalty points">{points} points applied · Save ₹{formatMoney(points / pointsPerRupee)}</Text>
      <TouchableOpacity onPress={() => {onChange(0); setInput('');}}><Text style={styles.link}>Remove points</Text></TouchableOpacity>
    </View> : <View style={styles.row}>
      <TextInput accessibilityLabel="Points to use" placeholder="Points to use" keyboardType="number-pad" value={input} onChangeText={setInput} style={styles.input} />
      <TouchableOpacity onPress={apply} style={styles.button}><Text style={styles.buttonText}>Apply</Text></TouchableOpacity>
    </View>}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: {borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 16, padding: 16, marginBottom: 14},
  title: {fontWeight: '700', fontSize: 16, marginBottom: 10}, row: {flexDirection: 'row', gap: 8, marginTop: 8},
  input: {borderWidth: 1, borderColor: '#DDD', borderRadius: 9, paddingHorizontal: 12, flex: 1},
  button: {backgroundColor: '#111', borderRadius: 9, padding: 12}, buttonText: {color: '#FFF', fontWeight: '700'},
  link: {fontWeight: '700', marginTop: 8}, error: {color: '#A11', marginTop: 8},
});
