import React, {useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {getActiveOffers, validateCoupon} from '../services/growthApi';
import type {CouponResult, Offer} from '../services/growthApi';
import {formatMoney} from '../utils/orderPricing';

type Props = {
  accessToken: string;
  subtotal: number;
  applied: CouponResult | null;
  onChange: (coupon: CouponResult | null) => void;
};

export default function CouponSection({accessToken, subtotal, applied, onChange}: Props) {
  const [code, setCode] = useState('');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [offersLoading, setOffersLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getActiveOffers(accessToken).then(value => {
      if (active) setOffers(value);
    }).catch(() => {
      if (active) setError('Offers could not be loaded. You can still enter a code.');
    }).finally(() => {if (active) setOffersLoading(false);});
    return () => {active = false;};
  }, [accessToken]);

  const apply = async (candidate: string) => {
    if (!candidate.trim()) {setError('Enter a coupon code.'); return;}
    setLoading(true);
    setError('');
    try {
      const result = await validateCoupon(accessToken, candidate, subtotal);
      onChange(result);
      setCode(result.code);
    } catch (cause) {
      onChange(null);
      setError(cause instanceof Error ? cause.message : 'Coupon could not be applied.');
    } finally {setLoading(false);}
  };

  return <View style={styles.card}>
    <Text style={styles.title}>Coupons & Offers</Text>
    {applied ? <View>
      <Text accessibilityLabel="Applied coupon">{applied.code} applied · Save ₹{formatMoney(applied.discount)}</Text>
      <TouchableOpacity onPress={() => {onChange(null); setCode('');}}><Text style={styles.link}>Remove coupon</Text></TouchableOpacity>
    </View> : <View style={styles.row}>
      <TextInput accessibilityLabel="Coupon code" placeholder="Enter coupon code" value={code} onChangeText={setCode} autoCapitalize="characters" style={styles.input} />
      <TouchableOpacity disabled={loading} onPress={() => apply(code)} style={styles.button}><Text style={styles.buttonText}>Apply</Text></TouchableOpacity>
    </View>}
    {loading ? <ActivityIndicator accessibilityLabel="Validating coupon" /> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {offersLoading ? <ActivityIndicator accessibilityLabel="Loading offers" /> : offers.length === 0 ? <Text>No active offers right now.</Text> : offers.map(offer =>
      <TouchableOpacity key={offer.id} onPress={() => offer.coupon_code && apply(offer.coupon_code)} style={styles.offer}>
        <Text style={styles.offerName}>{offer.name}</Text>
        <Text>{offer.coupon_code ? `${offer.coupon_code} · ` : ''}Min ₹{formatMoney(Number(offer.minimum_order_amount || 0))}</Text>
      </TouchableOpacity>)}
  </View>;
}

const styles = StyleSheet.create({
  card: {borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 16, padding: 16, marginBottom: 14},
  title: {fontWeight: '700', fontSize: 16, marginBottom: 10},
  row: {flexDirection: 'row', gap: 8},
  input: {borderWidth: 1, borderColor: '#DDD', borderRadius: 9, paddingHorizontal: 12, flex: 1},
  button: {backgroundColor: '#111', borderRadius: 9, padding: 12},
  buttonText: {color: '#FFF', fontWeight: '700'},
  link: {fontWeight: '700', marginTop: 8},
  error: {color: '#A11', marginTop: 8},
  offer: {borderTopWidth: 1, borderColor: '#EEE', marginTop: 12, paddingTop: 10},
  offerName: {fontWeight: '700'},
});
