import React from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type {AddressItem} from '../types/address';

type AddressScreenProps = {
  manageOnly?: boolean;
  addresses: AddressItem[];
  loading: boolean;
  saving: boolean;
  selectedAddressId: string | null;
  selectedAddress: AddressItem | null;

  onBack: () => void;
  onSelectAddress: (addressId: string) => void;
  onAddAddress: () => void;
  onEditAddress: (address: AddressItem) => void;
  onSetDefaultAddress: (address: AddressItem) => void;
  onDeleteAddress: (address: AddressItem) => void;
  onContinue: () => void;
};

export default function AddressScreen({
  manageOnly = false,
  addresses,
  loading,
  saving,
  selectedAddressId,
  selectedAddress,
  onBack,
  onSelectAddress,
  onAddAddress,
  onEditAddress,
  onSetDefaultAddress,
  onDeleteAddress,
  onContinue,
}: AddressScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.screenContainer}>
        <View style={styles.pageHeader}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.pageBack}>
              ← Back
            </Text>
          </TouchableOpacity>

          <Text style={styles.pageHeaderTitle}>
            {manageOnly ? 'Saved Addresses' : 'Pickup Address'}
          </Text>

          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              size="large"
              color="#111111"
            />

            <Text style={styles.loadingText}>
              Loading addresses...
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={
                styles.scrollContent
              }>
              {!manageOnly ? <View style={styles.checkoutStep}>
                <Text style={styles.checkoutStepNumber}>
                  1
                </Text>

                <View style={styles.flex}>
                  <Text style={styles.checkoutStepTitle}>
                    Select pickup address
                  </Text>

                  <Text style={styles.checkoutStepText}>
                    Your driver will collect the laundry from this location.
                  </Text>
                </View>
              </View> : null}

              {addresses.length === 0 ? (
                <View style={styles.noAddressCard}>
                  <Text style={styles.noAddressEmoji}>
                    📍
                  </Text>

                  <Text style={styles.noAddressTitle}>
                    No saved addresses
                  </Text>

                  <Text style={styles.noAddressText}>
                    Add your pickup address to continue.
                  </Text>
                </View>
              ) : (
                addresses.map(address => {
                  const selected =
                    address.id === selectedAddressId;

                  return (
                    <TouchableOpacity
                      key={address.id}
                      style={[
                        styles.addressCard,
                        selected &&
                          styles.addressCardSelected,
                      ]}
                      disabled={saving}
                      onPress={() =>
                        onSelectAddress(address.id)
                      }>
                      <View style={styles.addressCardTop}>
                        <View
                          style={styles.addressRadioOuter}>
                          {selected ? (
                            <View
                              style={
                                styles.addressRadioInner
                              }
                            />
                          ) : null}
                        </View>

                        <View style={styles.addressInfo}>
                          <View
                            style={
                              styles.addressLabelRow
                            }>
                            <Text
                              style={styles.addressLabel}>
                              {address.label ||
                                'Address'}
                            </Text>

                            {address.is_default ? (
                              <View
                                style={
                                  styles.defaultBadge
                                }>
                                <Text
                                  style={
                                    styles.defaultBadgeText
                                  }>
                                  DEFAULT
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          <Text
                            style={styles.addressPrimary}>
                            {address.address_line1}
                          </Text>

                          {address.address_line2 ? (
                            <Text
                              style={
                                styles.addressSecondary
                              }>
                              {address.address_line2}
                            </Text>
                          ) : null}

                          <Text
                            style={
                              styles.addressSecondary
                            }>
                            {[
                              address.city,
                              address.state,
                              address.postal_code,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.addressActions}>
                        <TouchableOpacity
                          style={
                            styles.addressSmallButton
                          }
                          disabled={saving}
                          onPress={() =>
                            onEditAddress(address)
                          }>
                          <Text
                            style={
                              styles.addressSmallButtonText
                            }>
                            Edit
                          </Text>
                        </TouchableOpacity>

                        {!address.is_default ? (
                          <TouchableOpacity
                            style={
                              styles.addressSmallButton
                            }
                            disabled={saving}
                            onPress={() =>
                              onSetDefaultAddress(address)
                            }>
                            <Text
                              style={
                                styles.addressSmallButtonText
                              }>
                              Set Default
                            </Text>
                          </TouchableOpacity>
                        ) : null}

                        <TouchableOpacity
                          style={
                            styles.addressDeleteButton
                          }
                          disabled={saving}
                          onPress={() =>
                            onDeleteAddress(address)
                          }>
                          <Text
                            style={
                              styles.addressDeleteText
                            }>
                            Delete
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}

              <TouchableOpacity
                style={styles.addAddressButton}
                disabled={saving}
                onPress={onAddAddress}>
                <Text style={styles.addAddressPlus}>
                  +
                </Text>

                <View>
                  <Text style={styles.addAddressTitle}>
                    Add New Address
                  </Text>

                  <Text style={styles.addAddressText}>
                    Add another pickup location
                  </Text>
                </View>
              </TouchableOpacity>
            </ScrollView>

            {!manageOnly ? <View style={styles.continueArea}>
              {selectedAddress ? (
                <View
                  style={styles.selectedAddressSummary}>
                  <Text
                    style={
                      styles.selectedAddressLabel
                    }>
                    Pickup from
                  </Text>

                  <Text
                    style={
                      styles.selectedAddressName
                    }
                    numberOfLines={1}>
                    {selectedAddress.label ||
                      selectedAddress.address_line1}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.continueButton,
                  (!selectedAddressId || saving) &&
                    styles.buttonDisabled,
                ]}
                disabled={
                  !selectedAddressId || saving
                }
                onPress={onContinue}>
                {saving ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={
                      styles.continueButtonText
                    }>
                    Continue to Pickup Slot
                  </Text>
                )}
              </TouchableOpacity>
            </View> : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  flex: {
    flex: 1,
  },

  screenContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },

  pageHeader: {
    height: 65,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  pageBack: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 60,
  },

  pageHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 8,
  },

  headerSpacer: {
    width: 60,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666666',
  },

  scrollContent: {
    paddingBottom: 160,
  },

  checkoutStep: {
    flexDirection: 'row',
    backgroundColor: '#F7F7F7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },

  checkoutStepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#111111',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 30,
    marginRight: 12,
    fontWeight: '700',
  },

  checkoutStepTitle: {
    fontWeight: '700',
  },

  checkoutStepText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: '#666666',
  },

  addressCard: {
    borderWidth: 1,
    borderColor: '#E4E4E4',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },

  addressCardSelected: {
    borderWidth: 2,
    borderColor: '#111111',
  },

  addressCardTop: {
    flexDirection: 'row',
  },

  addressRadioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  addressRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#111111',
  },

  addressInfo: {
    flex: 1,
  },

  addressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  addressLabel: {
    fontSize: 16,
    fontWeight: '700',
  },

  defaultBadge: {
    marginLeft: 8,
    backgroundColor: '#111111',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },

  defaultBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },

  addressPrimary: {
    marginTop: 6,
    fontSize: 14,
  },

  addressSecondary: {
    marginTop: 2,
    fontSize: 13,
    color: '#666666',
  },

  addressActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },

  addressSmallButton: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  addressSmallButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },

  addressDeleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  addressDeleteText: {
    color: '#B00020',
    fontSize: 12,
    fontWeight: '600',
  },

  noAddressCard: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 16,
    padding: 25,
    alignItems: 'center',
  },

  noAddressEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },

  noAddressTitle: {
    fontSize: 17,
    fontWeight: '700',
  },

  noAddressText: {
    marginTop: 5,
    color: '#666666',
    textAlign: 'center',
  },

  addAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#BBBBBB',
    borderRadius: 16,
    padding: 17,
    marginTop: 10,
  },

  addAddressPlus: {
    width: 35,
    fontSize: 30,
    marginRight: 10,
  },

  addAddressTitle: {
    fontWeight: '700',
  },

  addAddressText: {
    marginTop: 2,
    fontSize: 12,
    color: '#777777',
  },

  continueArea: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 10,
    paddingTop: 10,
    backgroundColor: '#FFFFFF',
  },

  selectedAddressSummary: {
    marginBottom: 10,
  },

  selectedAddressLabel: {
    fontSize: 11,
    color: '#777777',
  },

  selectedAddressName: {
    marginTop: 2,
    fontWeight: '600',
  },

  continueButton: {
    minHeight: 52,
    backgroundColor: '#111111',
    borderRadius: 13,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  buttonDisabled: {
    opacity: 0.4,
  },
});
