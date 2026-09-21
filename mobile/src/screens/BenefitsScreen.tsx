import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {getActiveOffers, getLoyaltyInfo, getReferralInfo} from '../services/growthApi';
import type {LoyaltyInfo, ReferralInfo, Offer} from '../services/growthApi';

type Props = {accessToken: string; onBack: () => void};

export default function BenefitsScreen({accessToken, onBack}: Props) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState('');
  const refreshOffers = useCallback(async () => {
    setOffersLoading(true); setOffersError('');
    try {setOffers(await getActiveOffers(accessToken));}
    catch (cause) {setOffersError(cause instanceof Error ? cause.message : 'Offers are unavailable.');}
    finally {setOffersLoading(false);}
  }, [accessToken]);
  useEffect(() => {refreshOffers();}, [refreshOffers]);
  const [referrals, setReferrals] = useState<ReferralInfo | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [referralData, loyaltyData] = await Promise.all([
        getReferralInfo(accessToken), getLoyaltyInfo(accessToken),
      ]);
      setReferrals(referralData);
      setLoyalty(loyaltyData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Benefits are unavailable.');
    } finally {setLoading(false);}
  }, [accessToken]);
  useEffect(() => {refresh();}, [refresh]);
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity onPress={onBack}><Text style={styles.link}>← Back</Text></TouchableOpacity>
    <Text style={styles.heading}>Offers & Rewards</Text>
    <View style={styles.card}>
      <Text style={styles.title}>Coupons & offers</Text>
      <Text>Apply a coupon during order review. Eligibility and savings are checked at checkout.</Text>
      {offersLoading ? <ActivityIndicator accessibilityLabel="Loading offers" /> : null}
      {offersError ? <><Text style={styles.error}>{offersError}</Text><TouchableOpacity onPress={refreshOffers}><Text style={styles.link}>Retry offers</Text></TouchableOpacity></> : null}
      {!offersLoading && !offersError && !offers.length ? <Text>No offers are available right now.</Text> : null}
      {offers.map(offer => <View key={offer.id}>
        <Text style={styles.subtitle}>{offer.name}</Text>
        {offer.coupon_code ? <Text selectable>Code: {offer.coupon_code}</Text> : <Text>Automatic offer</Text>}
        <Text>{offer.discount_type === 'percentage' ? `${Number(offer.discount_value)}% off` : `₹${Number(offer.discount_value).toFixed(2)} off`}{Number(offer.minimum_order_amount) > 0 ? ` on orders from ₹${Number(offer.minimum_order_amount).toFixed(2)}` : ''}{offer.maximum_discount != null ? ` · Save up to ₹${Number(offer.maximum_discount).toFixed(2)}` : ''}</Text>
      </View>)}
    </View>
    {loading ? <ActivityIndicator accessibilityLabel="Loading benefits" /> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {error ? <TouchableOpacity onPress={refresh}><Text style={styles.link}>Retry</Text></TouchableOpacity> : null}
    {referrals ? <View style={styles.card}>
      <Text style={styles.title}>Your referral code</Text>
      <Text selectable style={styles.code}>{referrals.code}</Text>
      <TouchableOpacity onPress={() => Share.share({message: `Join Bright & White with my referral code ${referrals.code}`})}><Text style={styles.link}>Share code</Text></TouchableOpacity>
      <Text style={styles.subtitle}>Referral history</Text>
      {referrals.history.length === 0 ? <Text>No referral rewards yet.</Text> : referrals.history.map(row =>
        <Text key={row.id}>{row.status || row.reward_status || 'Pending'} · {new Date(row.created_at).toLocaleDateString()}</Text>)}
    </View> : null}
    {loyalty ? <View style={styles.card}>
      <Text style={styles.title}>Loyalty points</Text>
      <Text accessibilityLabel="Loyalty balance" style={styles.code}>{loyalty.balance}</Text>
      <Text>100 points = ₹1. Redeem at least 1,000 points (₹10) during checkout.</Text>
      <Text>Earn 1 point per ₹100 paid after delivery.</Text>
      <Text style={styles.subtitle}>Points history</Text>
      {loyalty.transactions.length === 0 ? <Text>No points activity yet.</Text> : loyalty.transactions.map(row =>
        <Text key={row.id}>{row.points > 0 ? '+' : ''}{row.points} · {row.transaction_type} · {new Date(row.created_at).toLocaleDateString()}</Text>)}
    </View> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#FFF'}, content: {padding: 20, gap: 14},
  heading: {fontSize: 22, fontWeight: '800'}, card: {padding: 16, borderWidth: 1, borderColor: '#DDD', borderRadius: 16, gap: 8},
  title: {fontSize: 16, fontWeight: '700'}, subtitle: {fontWeight: '700', marginTop: 10},
  code: {fontSize: 24, fontWeight: '800'}, link: {fontWeight: '700'},
  error: {color: '#A11'},
});
