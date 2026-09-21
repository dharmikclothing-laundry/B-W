import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {AdminCatalogue, CatalogueCategory, CatalogueService, createAdminCategory, createAdminService, getAdminCatalogue, setAdminPackageEligibility, setAdminPricingPolicy, setAdminServicePrice, updateAdminCategory, updateAdminService} from '../services/adminCatalogueApi';
import {FacilityChoice, listAdminFacilities} from '../services/adminStaffApi';

type Props = {accessToken: string; onBack: () => void};
const money = (value: number) => Number(value).toFixed(2);
export default function AdminCatalogueScreen({accessToken, onBack}: Props) {
  const [data, setData] = useState<AdminCatalogue | null>(null);
  const [facilities, setFacilities] = useState<FacilityChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [category, setCategory] = useState<CatalogueCategory | null>(null);
  const [service, setService] = useState<CatalogueService | null>(null);
  const [form, setForm] = useState<'category' | 'service' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pricingUnit, setPricingUnit] = useState('item');
  const [categoryId, setCategoryId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [price, setPrice] = useState('');
  const [fee, setFee] = useState('');
  const [threshold, setThreshold] = useState('');
  const [gst, setGst] = useState('');
  const [minimum, setMinimum] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [next, places] = await Promise.all([getAdminCatalogue(accessToken), listAdminFacilities(accessToken)]);
      setData(next); setFacilities(places.filter(place => place.is_active));
      setFee(String(next.policy.pickupDeliveryFee)); setThreshold(String(next.policy.freeDeliveryThreshold)); setGst(String(next.policy.gstRatePercent)); setMinimum(String(next.policy.minimumOrderAmount));
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Catalogue unavailable.');}
    finally {setLoading(false);}
  }, [accessToken]);
  useEffect(() => {load();}, [load]);
  const run = async (action: () => Promise<unknown>, message: string) => {
    if (saving) return;
    setSaving(true); setError(''); setSuccess('');
    try {await action(); await load(); setSuccess(message);}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Change was not saved.');}
    finally {setSaving(false);}
  };
  const selectCategory = (item: CatalogueCategory | null) => {setForm('category'); setCategory(item); setService(null); setName(item?.name ?? ''); setDescription(item?.description ?? '');};
  const selectService = (item: CatalogueService | null) => {setForm('service'); setService(item); setCategory(null); setName(item?.name ?? ''); setDescription(item?.description ?? ''); setPricingUnit(item?.pricing_unit ?? 'item'); setCategoryId(item?.category_id ?? ''); setPrice(''); setFacilityId('');};
  const latestPrice = (id: string, scope: string | null) => data?.prices.find(row => row.service_id === id && row.facility_id === scope)?.price;
  const saveCategory = () => run(() => category ? updateAdminCategory(accessToken, category.id, {name: name.trim(), description: description.trim()}) : createAdminCategory(accessToken, {name: name.trim(), description: description.trim()}), 'Category saved.');
  const saveService = () => run(() => service ? updateAdminService(accessToken, service.id, {name: name.trim(), description: description.trim(), pricingUnit: pricingUnit.trim(), categoryId: categoryId || undefined}) : createAdminService(accessToken, {name: name.trim(), description: description.trim(), pricingUnit: pricingUnit.trim(), categoryId: categoryId || undefined}), 'Service saved.');
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
    <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.link}>← Admin dashboard</Text></TouchableOpacity>
    <Text style={styles.title}>Services and pricing</Text>
    {loading ? <ActivityIndicator accessibilityLabel="Loading catalogue" /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {error ? <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.link}>Retry catalogue</Text></TouchableOpacity> : null}
    {success ? <Text accessibilityRole="alert">{success}</Text> : null}
    {data ? <>
      <Text style={styles.heading}>Categories</Text>
      {!data.categories.length ? <Text>No categories.</Text> : data.categories.map(item =>
        <TouchableOpacity accessibilityRole="button" key={item.id} style={styles.card} onPress={() => selectCategory(item)}><Text>{item.name} · {item.is_active ? 'Active' : 'Inactive'}</Text></TouchableOpacity>)}
      <TouchableOpacity accessibilityRole="button" onPress={() => selectCategory(null)}><Text style={styles.link}>New category</Text></TouchableOpacity>
      {form === 'category' ? <View style={styles.card}>
        <Text>{category ? 'Edit category' : 'New category'}</Text>
        <TextInput accessibilityLabel="Category name" value={name} onChangeText={setName} placeholder="Category name" style={styles.input} />
        <TextInput accessibilityLabel="Category description" value={description} onChangeText={setDescription} placeholder="Description" style={styles.input} />
        <TouchableOpacity accessibilityRole="button" disabled={saving || !name.trim()} onPress={saveCategory}><Text style={styles.link}>Save category</Text></TouchableOpacity>
        {category ? <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => run(() => updateAdminCategory(accessToken, category.id, {isActive: !category.is_active}), 'Category availability changed.')}><Text style={styles.link}>{category.is_active ? 'Deactivate category' : 'Activate category'}</Text></TouchableOpacity> : null}
      </View> : null}
      <Text style={styles.heading}>Services</Text>
      {!data.services.length ? <Text>No services.</Text> : data.services.map(item =>
        <TouchableOpacity accessibilityRole="button" key={item.id} style={styles.card} onPress={() => selectService(item)}>
          <Text style={styles.bold}>{item.name} · {item.is_active ? 'Active' : 'Inactive'}</Text>
          <Text>{item.pricing_unit} · Global price {latestPrice(item.id, null) === undefined ? 'Quote only' : `₹${money(latestPrice(item.id, null)!)}`}</Text>
          <Text>Package eligibility: {data.packageEligibility.filter(row => row.service_id === item.id).length} package(s)</Text>
        </TouchableOpacity>)}
      <TouchableOpacity accessibilityRole="button" onPress={() => selectService(null)}><Text style={styles.link}>New service</Text></TouchableOpacity>
      {form === 'service' ? <View style={styles.card}>
        <Text>{service ? 'Edit service' : 'New service'}</Text>
        <TextInput accessibilityLabel="Service name" value={name} onChangeText={setName} placeholder="Service name" style={styles.input} />
        <TextInput accessibilityLabel="Service description" value={description} onChangeText={setDescription} placeholder="Description" style={styles.input} />
        <TextInput accessibilityLabel="Pricing unit" value={pricingUnit} onChangeText={setPricingUnit} placeholder="item, kg, set" style={styles.input} />
        <Text>Category</Text>{data.categories.filter(item => item.is_active).map(item => <TouchableOpacity accessibilityRole="button" key={item.id} onPress={() => setCategoryId(item.id)}><Text style={categoryId === item.id ? styles.selected : styles.link}>{item.name}</Text></TouchableOpacity>)}
        <TouchableOpacity accessibilityRole="button" disabled={saving || !name.trim() || !pricingUnit.trim()} onPress={saveService}><Text style={styles.link}>Save service</Text></TouchableOpacity>
        {service ? <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => run(() => updateAdminService(accessToken, service.id, {isActive: !service.is_active}), 'Service availability changed.')}><Text style={styles.link}>{service.is_active ? 'Deactivate service' : 'Activate service'}</Text></TouchableOpacity> : null}
      </View> : null}
      {service ? <View style={styles.card}>
        <Text style={styles.heading}>Set future checkout price</Text><Text>Old order prices remain recorded on each order.</Text>
        <TextInput accessibilityLabel="Service price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="Price in rupees" style={styles.input} />
        <Text>Price scope</Text><TouchableOpacity accessibilityRole="button" onPress={() => setFacilityId('')}><Text style={!facilityId ? styles.selected : styles.link}>Global</Text></TouchableOpacity>
        {facilities.map(place => <TouchableOpacity accessibilityRole="button" key={place.id} onPress={() => setFacilityId(place.id)}><Text style={facilityId === place.id ? styles.selected : styles.link}>{place.name}</Text></TouchableOpacity>)}
        <TouchableOpacity accessibilityRole="button" disabled={saving || !price.trim()} onPress={() => run(() => setAdminServicePrice(accessToken, service.id, Number(price), facilityId || undefined), 'Future service price saved.')}><Text style={styles.link}>Save new price</Text></TouchableOpacity>
      </View> : null}
      {service ? <View style={styles.card}>
        <Text style={styles.heading}>Package eligibility</Text>
        <Text>Packages already purchased are locked to preserve customer credits.</Text>
        <TextInput accessibilityLabel="Package usage limit" value={usageLimit} onChangeText={setUsageLimit} keyboardType="number-pad" placeholder="Usage limit; blank means unlimited" style={styles.input} />
        {!data.packages.length ? <Text>No packages available.</Text> : data.packages.map(item => {
          const current = data.packageEligibility.find(row => row.package_id === item.id && row.service_id === service.id);
          return <View key={item.id} style={styles.card}><Text>{item.name} · {current ? `Eligible (${current.usage_limit ?? 'unlimited'})` : 'Not eligible'}{item.isLocked ? ' · locked' : ''}</Text>
            {!item.isLocked ? <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => run(() => setAdminPackageEligibility(accessToken, item.id, service.id, !current, usageLimit.trim() ? Number(usageLimit) : null), 'Package eligibility saved.')}><Text style={styles.link}>{current ? 'Remove eligibility' : 'Add eligibility'}</Text></TouchableOpacity> : null}
          </View>;
        })}
      </View> : null}
      <Text style={styles.heading}>Checkout fees and GST</Text>
      <Text>Current: ₹{money(data.policy.pickupDeliveryFee)} fee below ₹{money(data.policy.freeDeliveryThreshold)}; GST {data.policy.gstRatePercent}%; minimum order ₹{money(data.policy.minimumOrderAmount)}.</Text>
      <TextInput accessibilityLabel="Pickup and delivery fee" value={fee} onChangeText={setFee} keyboardType="decimal-pad" style={styles.input} />
      <TextInput accessibilityLabel="Free delivery threshold" value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" style={styles.input} />
      <TextInput accessibilityLabel="GST rate percent" value={gst} onChangeText={setGst} keyboardType="decimal-pad" style={styles.input} />
      <TextInput accessibilityLabel="Minimum order amount" value={minimum} onChangeText={setMinimum} keyboardType="decimal-pad" style={styles.input} />
      <TouchableOpacity accessibilityRole="button" disabled={saving || !fee || !threshold || !gst || !minimum} onPress={() => run(() => setAdminPricingPolicy(accessToken, {pickupDeliveryFee: Number(fee), freeDeliveryThreshold: Number(threshold), gstRatePercent: Number(gst), minimumOrderAmount: Number(minimum)}), 'Future checkout policy saved.')}><Text style={styles.link}>Save checkout policy</Text></TouchableOpacity>
      <Text style={styles.heading}>Recent Admin changes</Text>
      {!data.audit.length ? <Text>No catalogue changes yet.</Text> : data.audit.slice(0, 20).map(row => <Text key={row.id}>{row.action.replace(/_/g, ' ')} · {new Date(row.created_at).toLocaleString()}</Text>)}
    </> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({page: {flex: 1, backgroundColor: '#fff'}, content: {padding: 20, gap: 12}, title: {fontSize: 25, fontWeight: '700'}, heading: {fontSize: 19, fontWeight: '700'}, card: {padding: 13, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, gap: 8}, input: {padding: 11, borderWidth: 1, borderColor: '#bbb', borderRadius: 8}, bold: {fontWeight: '700'}, link: {fontWeight: '700'}, selected: {fontWeight: '700', color: '#15a'}, error: {color: '#a11'}});
