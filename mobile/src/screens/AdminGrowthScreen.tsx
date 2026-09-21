import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {AdminGrowthOverview, createAdminOffer, createAdminPackage, getAdminGrowth, OfferInput, PackageInput,
  setAdminGrowthSettings, setAdminOfferActive, setAdminPackageActive, setAdminPackageEligibility, updateAdminOffer, updateAdminPackage} from '../services/adminGrowthApi';

type Props = {accessToken: string; onBack: () => void};
const defaultOffer: {couponCode: string; name: string; discountType: 'fixed' | 'percentage'; discountValue: string; minimumOrderAmount: string;
  maximumDiscount: string; startsAt: string; expiresAt: string; usageLimit: string; eligibilityNote: string} =
  {couponCode: '', name: '', discountType: 'fixed', discountValue: '', minimumOrderAmount: '0',
  maximumDiscount: '', startsAt: '', expiresAt: '', usageLimit: '', eligibilityNote: ''};
const defaultPackage = {name: '', description: '', price: '', validityDays: '30'};
const number = (value: string, label: string, positive = false) => {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed) || (positive ? parsed <= 0 : parsed < 0)) throw new Error(`Enter a valid ${label}.`);
  return parsed;
};
const money = (value: number | string) => `₹${Number(value).toFixed(2)}`;

export default function AdminGrowthScreen({accessToken, onBack}: Props) {
  const [data, setData] = useState<AdminGrowthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [offerId, setOfferId] = useState<string | null>(null);
  const [offer, setOffer] = useState(defaultOffer);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [pkg, setPackage] = useState(defaultPackage);
  const [creditLimit, setCreditLimit] = useState('');
  const [settings, setSettings] = useState({referralEnabled: true, referralRewardPoints: '0',
    loyaltyEarnPointsPerRupee: '0.01', loyaltyPointsPerRupee: '10', loyaltyMinimumRedemptionRupees: '100'});
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const next = await getAdminGrowth(accessToken);
      setData(next);
      setSettings({referralEnabled: next.settings.referral_enabled,
        referralRewardPoints: String(next.settings.referral_reward_points),
        loyaltyEarnPointsPerRupee: String(next.settings.loyalty_earn_points_per_rupee),
        loyaltyPointsPerRupee: String(next.settings.loyalty_points_per_rupee),
        loyaltyMinimumRedemptionRupees: String(next.settings.loyalty_minimum_redemption_rupees)});
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Growth programs unavailable.');}
    finally {setLoading(false);}
  }, [accessToken]);
  useEffect(() => {load();}, [load]);
  const act = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {await action(); await load(); setSuccess(message);}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Unable to save growth program.');}
    finally {setBusy(false);}
  };
  const saveOffer = () => act(async () => {
    const input: OfferInput = {couponCode: offer.couponCode.trim().toUpperCase(), name: offer.name.trim(),
      discountType: offer.discountType, discountValue: number(offer.discountValue, 'discount', true),
      minimumOrderAmount: number(offer.minimumOrderAmount, 'minimum order amount'),
      maximumDiscount: offer.maximumDiscount.trim() ? number(offer.maximumDiscount, 'maximum discount') : null,
      startsAt: offer.startsAt.trim() || null, expiresAt: offer.expiresAt.trim() || null,
      usageLimit: offer.usageLimit.trim() ? number(offer.usageLimit, 'usage limit', true) : null,
      eligibilityNote: offer.eligibilityNote.trim()};
    if (input.usageLimit !== null && !Number.isSafeInteger(input.usageLimit)) throw new Error('Usage limit must be a whole number.');
    if (offerId) await updateAdminOffer(accessToken, offerId, input); else await createAdminOffer(accessToken, input);
    setOfferId(null); setOffer(defaultOffer);
  }, 'Offer saved.');
  const savePackage = () => act(async () => {
    const input: PackageInput = {name: pkg.name.trim(), description: pkg.description.trim(),
      price: number(pkg.price, 'package price', true), validityDays: number(pkg.validityDays, 'validity days', true)};
    if (!Number.isSafeInteger(input.validityDays)) throw new Error('Validity must be whole days.');
    if (packageId) await updateAdminPackage(accessToken, packageId, input); else await createAdminPackage(accessToken, input);
    setPackageId(null); setPackage(defaultPackage);
  }, 'Package saved.');
  const saveSettings = () => act(() => setAdminGrowthSettings(accessToken, {
    referralEnabled: settings.referralEnabled,
    referralRewardPoints: number(settings.referralRewardPoints, 'referral reward'),
    loyaltyEarnPointsPerRupee: number(settings.loyaltyEarnPointsPerRupee, 'loyalty earning rate'),
    loyaltyPointsPerRupee: number(settings.loyaltyPointsPerRupee, 'points per rupee', true),
    loyaltyMinimumRedemptionRupees: number(settings.loyaltyMinimumRedemptionRupees, 'minimum redemption'),
  }), 'Growth rules saved.');
  const field = (label: string, value: string, onChangeText: (value: string) => void, numeric = false) =>
    <TextInput accessibilityLabel={label} placeholder={label} value={value} onChangeText={onChangeText}
      keyboardType={numeric ? 'decimal-pad' : 'default'} style={styles.input} />;
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Admin dashboard</Text></TouchableOpacity>
    <Text style={styles.title}>Growth programs</Text>
    <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.link}>Refresh growth programs</Text></TouchableOpacity>
    {loading ? <ActivityIndicator accessibilityLabel="Loading growth programs" /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {error ? <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.link}>Retry growth programs</Text></TouchableOpacity> : null}
    {success ? <Text accessibilityRole="alert">{success}</Text> : null}
    {data ? <>
      <Text style={styles.heading}>Coupons and offers</Text>
      {data.offers.length ? data.offers.map(item => <View key={item.id} style={styles.card}>
        <Text style={styles.bold}>{item.coupon_code} · {item.name} · {item.is_active ? 'Active' : 'Inactive'}</Text>
        <Text>{item.discount_type} {item.discount_type === 'percentage' ? `${item.discount_value}%` : money(item.discount_value)} · Min {money(item.minimum_order_amount)}</Text>
        <Text>Valid {item.starts_at || 'now'} to {item.expires_at || 'no expiry'}</Text>
        <Text>Redemptions {item.redeemedCount}{item.usage_limit == null ? '' : ` / ${item.usage_limit}`}</Text>
        {item.eligibility_note ? <Text>{item.eligibility_note}</Text> : null}
        <Text>{item.termsLocked ? 'Redeemed terms locked; activation remains available.' : 'Terms editable until first redemption.'}</Text>
        {!item.termsLocked ? <TouchableOpacity accessibilityRole="button" onPress={() => {setOfferId(item.id); setOffer({couponCode: item.coupon_code,
          name: item.name, discountType: item.discount_type, discountValue: String(item.discount_value),
          minimumOrderAmount: String(item.minimum_order_amount), maximumDiscount: String(item.maximum_discount ?? ''),
          startsAt: item.starts_at || '', expiresAt: item.expires_at || '', usageLimit: String(item.usage_limit ?? ''),
          eligibilityNote: item.eligibility_note || ''});}}><Text style={styles.link}>Edit offer</Text></TouchableOpacity> : null}
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => act(() => setAdminOfferActive(accessToken, item.id, !item.is_active), 'Offer availability updated.')}>
          <Text style={styles.link}>{item.is_active ? 'Deactivate offer' : 'Activate offer'}</Text></TouchableOpacity>
      </View>) : <Text>No offers.</Text>}
      <Text style={styles.bold}>{offerId ? 'Edit offer' : 'Create offer'}</Text>
      {field('Coupon code', offer.couponCode, value => setOffer({...offer, couponCode: value}))}
      {field('Offer name', offer.name, value => setOffer({...offer, name: value}))}
      <TouchableOpacity accessibilityRole="button" onPress={() => setOffer({...offer, discountType: offer.discountType === 'fixed' ? 'percentage' : 'fixed'})}><Text style={styles.link}>Discount type: {offer.discountType} (tap to change)</Text></TouchableOpacity>
      {field('Discount value', offer.discountValue, value => setOffer({...offer, discountValue: value}), true)}
      {field('Minimum order amount', offer.minimumOrderAmount, value => setOffer({...offer, minimumOrderAmount: value}), true)}
      {field('Maximum discount (optional)', offer.maximumDiscount, value => setOffer({...offer, maximumDiscount: value}), true)}
      {field('Starts at ISO date (optional)', offer.startsAt, value => setOffer({...offer, startsAt: value}))}
      {field('Expires at ISO date (optional)', offer.expiresAt, value => setOffer({...offer, expiresAt: value}))}
      {field('Usage limit (optional)', offer.usageLimit, value => setOffer({...offer, usageLimit: value}), true)}
      {field('Eligibility note (optional)', offer.eligibilityNote, value => setOffer({...offer, eligibilityNote: value}))}
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={saveOffer}><Text style={styles.link}>Save offer</Text></TouchableOpacity>
      {offerId ? <TouchableOpacity accessibilityRole="button" onPress={() => {setOfferId(null); setOffer(defaultOffer);}}><Text style={styles.link}>Cancel offer edit</Text></TouchableOpacity> : null}
      <Text style={styles.heading}>Packages and subscriptions</Text>
      {data.packages.length ? data.packages.map(item => <View key={item.id} style={styles.card}>
        <Text style={styles.bold}>{item.name} · {item.is_active ? 'Active' : 'Inactive'}</Text>
        <Text>{money(item.price)} · {item.validity_days == null ? 'Calendar month' : `${item.validity_days} days`} · Sold {item.soldCount}</Text>
        <Text>{item.description || 'No description'}</Text>
        <Text>{item.termsLocked ? 'Sold contract locked; activation remains available.' : 'Terms editable until first purchase.'}</Text>
        {!item.termsLocked ? <TouchableOpacity accessibilityRole="button" onPress={() => {setPackageId(item.id); setPackage({name: item.name,
          description: item.description || '', price: String(item.price), validityDays: String(item.validity_days ?? 30)});}}><Text style={styles.link}>Edit package</Text></TouchableOpacity> : null}
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => act(() => setAdminPackageActive(accessToken, item.id, !item.is_active), 'Package availability updated.')}>
          <Text style={styles.link}>{item.is_active ? 'Deactivate package' : 'Activate package'}</Text></TouchableOpacity>
        {!item.termsLocked ? <>
          <Text>Included service credits</Text>
          {data.services.map(service => {const current = data.eligibility.find(row => row.package_id === item.id && row.service_id === service.id);
            return <View key={service.id} style={styles.row}><Text>{service.name}: {current ? current.usage_limit ?? 'unlimited' : 'not included'}</Text>
              <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => act(() => setAdminPackageEligibility(accessToken, item.id, service.id,
                !current, creditLimit.trim() ? number(creditLimit, 'credit limit') : null), 'Package credits updated.')}>
                <Text style={styles.link}>{current ? 'Remove' : 'Include'}</Text></TouchableOpacity>
            </View>;})}
        </> : null}
      </View>) : <Text>No packages.</Text>}
      {field('Credit limit for included service (blank = unlimited)', creditLimit, setCreditLimit, true)}
      <Text style={styles.bold}>{packageId ? 'Edit package' : 'Create package'}</Text>
      {field('Package name', pkg.name, value => setPackage({...pkg, name: value}))}
      {field('Package description', pkg.description, value => setPackage({...pkg, description: value}))}
      {field('Package price', pkg.price, value => setPackage({...pkg, price: value}), true)}
      {field('Validity days', pkg.validityDays, value => setPackage({...pkg, validityDays: value}), true)}
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={savePackage}><Text style={styles.link}>Save package</Text></TouchableOpacity>
      {packageId ? <TouchableOpacity accessibilityRole="button" onPress={() => {setPackageId(null); setPackage(defaultPackage);}}><Text style={styles.link}>Cancel package edit</Text></TouchableOpacity> : null}
      <Text style={styles.heading}>Referral and loyalty rules</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => setSettings({...settings, referralEnabled: !settings.referralEnabled})}>
        <Text style={styles.link}>Referrals: {settings.referralEnabled ? 'Enabled' : 'Disabled'} (tap to change)</Text></TouchableOpacity>
      {field('Referral reward points', settings.referralRewardPoints, value => setSettings({...settings, referralRewardPoints: value}), true)}
      {field('Earn points per rupee', settings.loyaltyEarnPointsPerRupee, value => setSettings({...settings, loyaltyEarnPointsPerRupee: value}), true)}
      {field('Points per rupee redeemed', settings.loyaltyPointsPerRupee, value => setSettings({...settings, loyaltyPointsPerRupee: value}), true)}
      {field('Minimum redemption rupees', settings.loyaltyMinimumRedemptionRupees, value => setSettings({...settings, loyaltyMinimumRedemptionRupees: value}), true)}
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={saveSettings}><Text style={styles.link}>Save growth rules</Text></TouchableOpacity>
      <Text>Individual loyalty balance adjustments are unavailable; customer transaction history is preserved.</Text>
      <Text style={styles.heading}>Program history</Text>
      <Text>Referral records: {data.referrals.length} · Loyalty transactions: {data.loyaltyHistory.length} · Package purchases: {data.subscriptions.length}</Text>
      {data.audit.length ? data.audit.map(row => <Text key={row.id}>{row.action.replace(/_/g, ' ')} · {new Date(row.created_at).toLocaleString('en-IN')}</Text>) : <Text>No Admin growth changes yet.</Text>}
    </> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#fff'}, content: {padding: 20, gap: 12}, title: {fontSize: 25, fontWeight: '700'}, heading: {fontSize: 19, fontWeight: '700'}, card: {padding: 14, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, gap: 8}, row: {flexDirection: 'row', justifyContent: 'space-between'}, bold: {fontWeight: '700'}, link: {fontWeight: '700'}, input: {borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 12}, error: {color: '#a11'}});
