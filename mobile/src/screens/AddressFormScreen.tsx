import React from 'react';

import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type {
  AddressFormState,
} from '../types/address';

type AddressFormScreenProps = {
  editing: boolean;

  form:
    AddressFormState;

  saving:
    boolean;

  onBack:
    () => void;

  onChange: (
    form: AddressFormState,
  ) => void;

  onChooseLocation:
    () => void;

  onSave:
    () => void;
};

export default function AddressFormScreen({
  editing,
  form,
  saving,
  onBack,
  onChange,
  onChooseLocation,
  onSave,
}: AddressFormScreenProps) {
  const updateField = <
    Key extends keyof AddressFormState,
  >(
    key: Key,
    value: AddressFormState[Key],
  ) => {
    onChange({
      ...form,
      [key]:
        value,
    });
  };

  const hasLocation =
    form.latitude !== null &&
    form.longitude !== null;

  return (
    <SafeAreaView
      style={
        styles.container
      }>
      <StatusBar
        barStyle="dark-content"
      />

      <View
        style={
          styles.screenContainer
        }>
        <View
          style={
            styles.pageHeader
          }>
          <TouchableOpacity
            disabled={
              saving
            }
            onPress={
              onBack
            }>
            <Text
              style={
                styles.pageBack
              }>
              ← Back
            </Text>
          </TouchableOpacity>

          <Text
            style={
              styles.pageHeaderTitle
            }>
            {editing
              ? 'Edit Address'
              : 'Add Address'}
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <ScrollView
          style={
            styles.flex
          }
          contentContainerStyle={
            styles.formScroll
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }>
          <View
            style={
              styles.locationSection
            }>
            <View
              style={
                styles.locationSectionHeader
              }>
              <View
                style={
                  styles.locationIconContainer
                }>
                <Text
                  style={
                    styles.locationIcon
                  }>
                  📍
                </Text>
              </View>

              <View
                style={
                  styles.locationSectionText
                }>
                <Text
                  style={
                    styles.locationSectionTitle
                  }>
                  Pickup Location
                </Text>

                <Text
                  style={
                    styles.locationSectionSubtitle
                  }>
                  Choose the exact pickup location on the map.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={
                styles.chooseLocationButton
              }
              disabled={
                saving
              }
              onPress={
                onChooseLocation
              }>
              <Text
                style={
                  styles.chooseLocationButtonText
                }>
                {hasLocation
                  ? 'Change Location on Map'
                  : 'Choose Location on Map'}
              </Text>
            </TouchableOpacity>

            {hasLocation ? (
              <View
                style={
                  styles.selectedLocationCard
                }>
                <Text
                  style={
                    styles.selectedLocationTitle
                  }>
                  ✓ Location selected
                </Text>

                <Text
                  style={
                    styles.coordinateText
                  }>
                  Latitude:{' '}
                  {form.latitude}
                </Text>

                <Text
                  style={
                    styles.coordinateText
                  }>
                  Longitude:{' '}
                  {form.longitude}
                </Text>
              </View>
            ) : (
              <Text
                style={
                  styles.locationHelpText
                }>
                You can also enter the address manually below.
              </Text>
            )}
          </View>

          <Text
            style={
              styles.formLabel
            }>
            Address Label
          </Text>

          <TextInput
            style={
              styles.input
            }
            placeholder="Home, Office, Other"
            value={
              form.label
            }
            editable={
              !saving
            }
            autoCapitalize="words"
            onChangeText={
              value =>
                updateField(
                  'label',
                  value,
                )
            }
          />

          <Text
            style={
              styles.formLabel
            }>
            Address Line 1 *
          </Text>

          <TextInput
            style={
              styles.input
            }
            placeholder="House / Flat / Building / Street"
            value={
              form.addressLine1
            }
            editable={
              !saving
            }
            autoCapitalize="words"
            onChangeText={
              value =>
                updateField(
                  'addressLine1',
                  value,
                )
            }
          />

          <Text
            style={
              styles.formLabel
            }>
            Address Line 2
          </Text>

          <TextInput
            style={
              styles.input
            }
            placeholder="Area / Landmark"
            value={
              form.addressLine2
            }
            editable={
              !saving
            }
            autoCapitalize="words"
            onChangeText={
              value =>
                updateField(
                  'addressLine2',
                  value,
                )
            }
          />

          <Text
            style={
              styles.formLabel
            }>
            City
          </Text>

          <TextInput
            style={
              styles.input
            }
            placeholder="Hyderabad"
            value={
              form.city
            }
            editable={
              !saving
            }
            autoCapitalize="words"
            onChangeText={
              value =>
                updateField(
                  'city',
                  value,
                )
            }
          />

          <Text
            style={
              styles.formLabel
            }>
            State
          </Text>

          <TextInput
            style={
              styles.input
            }
            placeholder="Telangana"
            value={
              form.state
            }
            editable={
              !saving
            }
            autoCapitalize="words"
            onChangeText={
              value =>
                updateField(
                  'state',
                  value,
                )
            }
          />

          <Text
            style={
              styles.formLabel
            }>
            Postal Code
          </Text>

          <TextInput
            style={
              styles.input
            }
            placeholder="500001"
            keyboardType="number-pad"
            value={
              form.postalCode
            }
            editable={
              !saving
            }
            onChangeText={
              value =>
                updateField(
                  'postalCode',
                  value,
                )
            }
          />

          <TouchableOpacity
            style={
              styles.defaultToggle
            }
            disabled={
              saving
            }
            onPress={() =>
              updateField(
                'isDefault',
                !form.isDefault,
              )
            }>
            <View
              style={[
                styles.checkbox,

                form.isDefault &&
                  styles.checkboxSelected,
              ]}>
              {form.isDefault ? (
                <Text
                  style={
                    styles.checkboxTick
                  }>
                  ✓
                </Text>
              ) : null}
            </View>

            <View
              style={
                styles.defaultToggleText
              }>
              <Text
                style={
                  styles.defaultToggleTitle
                }>
                Set as default address
              </Text>

              <Text
                style={
                  styles.defaultToggleSubtitle
                }>
                Use this address automatically during checkout.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.saveButton,

              saving &&
                styles.buttonDisabled,
            ]}
            disabled={
              saving
            }
            onPress={
              onSave
            }>
            {saving ? (
              <View
                style={
                  styles.loadingRow
                }>
                <ActivityIndicator
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.loadingButtonText
                  }>
                  Saving...
                </Text>
              </View>
            ) : (
              <Text
                style={
                  styles.saveButtonText
                }>
                {editing
                  ? 'Save Changes'
                  : 'Save Address'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#FFFFFF',
    },

    flex: {
      flex: 1,
    },

    screenContainer: {
      flex: 1,
      paddingHorizontal:
        20,
    },

    pageHeader: {
      height: 65,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    pageBack: {
      fontSize: 15,
      fontWeight:
        '600',
      minWidth: 60,
      color:
        '#111111',
    },

    pageHeaderTitle: {
      flex: 1,
      textAlign:
        'center',
      fontSize: 18,
      fontWeight:
        '700',
      marginHorizontal:
        8,
      color:
        '#111111',
    },

    headerSpacer: {
      width: 60,
    },

    formScroll: {
      paddingBottom: 40,
    },

    locationSection: {
      borderWidth: 1,
      borderColor:
        '#E5E5E5',
      borderRadius: 16,
      padding: 16,
      marginBottom: 22,
    },

    locationSectionHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    locationIconContainer: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor:
        '#F4F4F4',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginRight: 12,
    },

    locationIcon: {
      fontSize: 21,
    },

    locationSectionText: {
      flex: 1,
    },

    locationSectionTitle: {
      fontSize: 15,
      fontWeight:
        '700',
      color:
        '#111111',
    },

    locationSectionSubtitle: {
      marginTop: 3,
      fontSize: 11,
      lineHeight: 16,
      color:
        '#666666',
    },

    chooseLocationButton: {
      minHeight: 46,
      marginTop: 15,
      borderRadius: 11,
      backgroundColor:
        '#111111',
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal: 14,
    },

    chooseLocationButtonText: {
      color:
        '#FFFFFF',
      fontSize: 13,
      fontWeight:
        '700',
    },

    selectedLocationCard: {
      marginTop: 12,
      backgroundColor:
        '#F7F7F7',
      borderRadius: 10,
      padding: 12,
    },

    selectedLocationTitle: {
      fontSize: 11,
      fontWeight:
        '700',
      color:
        '#111111',
      marginBottom: 5,
    },

    coordinateText: {
      fontSize: 10,
      lineHeight: 16,
      color:
        '#666666',
    },

    locationHelpText: {
      marginTop: 10,
      fontSize: 10,
      lineHeight: 15,
      color:
        '#777777',
      textAlign:
        'center',
    },

    formLabel: {
      fontSize: 13,
      fontWeight:
        '600',
      marginBottom: 7,
    },

    input: {
      borderWidth: 1,
      borderColor:
        '#D8D8D8',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      marginBottom: 18,
      fontSize: 15,
      color:
        '#111111',
    },

    defaultToggle: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginBottom: 25,
    },

    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 1,
      borderColor:
        '#BBBBBB',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    checkboxSelected: {
      backgroundColor:
        '#111111',
      borderColor:
        '#111111',
    },

    checkboxTick: {
      color:
        '#FFFFFF',
      fontSize: 14,
      fontWeight:
        '700',
    },

    defaultToggleText: {
      flex: 1,
      marginLeft: 12,
    },

    defaultToggleTitle: {
      fontWeight:
        '600',
    },

    defaultToggleSubtitle: {
      marginTop: 2,
      fontSize: 11,
      lineHeight: 16,
      color:
        '#777777',
    },

    saveButton: {
      minHeight: 52,
      width: '100%',
      paddingVertical: 16,
      borderRadius: 12,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#111111',
    },

    saveButtonText: {
      color:
        '#FFFFFF',
      fontSize: 17,
      fontWeight:
        '600',
    },

    buttonDisabled: {
      opacity: 0.4,
    },

    loadingRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    loadingButtonText: {
      color:
        '#FFFFFF',
      fontSize: 16,
      fontWeight:
        '600',
      marginLeft: 10,
    },
  });
