import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type {AddressItem} from '../types/address';

import type {
  PickupDateChoice,
  PickupSlot,
} from '../hooks/usePickupSchedule';

type PickupSlotScreenProps = {
  selectedAddress: AddressItem | null;

  pickupDateChoices: PickupDateChoice[];
  pickupSlots: PickupSlot[];

  selectedPickupDateKey: string | null;
  selectedPickupSlotId: string | null;

  pickupScheduledAt: string;
  pickupSlotLabel: string;

  selectedPickupDate: PickupDateChoice | null;

  onBack: () => void;
  onChoosePickupDate: (dateKey: string) => void;
  onChoosePickupSlot: (slot: PickupSlot) => void;
  onContinue: () => void;

  isSlotUnavailable: (
    dateKey: string,
    slot: PickupSlot,
  ) => boolean;
};

export default function PickupSlotScreen({
  selectedAddress,
  pickupDateChoices,
  pickupSlots,
  selectedPickupDateKey,
  selectedPickupSlotId,
  pickupScheduledAt,
  pickupSlotLabel,
  selectedPickupDate,
  onBack,
  onChoosePickupDate,
  onChoosePickupSlot,
  onContinue,
  isSlotUnavailable,
}: PickupSlotScreenProps) {
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
            Pickup Date & Time
          </Text>

          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={
            styles.scrollContent
          }>
          {selectedAddress ? (
            <View style={styles.addressSummary}>
              <View style={styles.addressTop}>
                <Text style={styles.addressIcon}>
                  📍
                </Text>

                <View style={styles.flex}>
                  <Text style={styles.summaryLabel}>
                    Pickup from
                  </Text>

                  <Text style={styles.addressName}>
                    {selectedAddress.label ||
                      'Selected Address'}
                  </Text>

                  <Text style={styles.addressText}>
                    {selectedAddress.address_line1}
                  </Text>

                  {selectedAddress.address_line2 ? (
                    <Text style={styles.addressText}>
                      {selectedAddress.address_line2}
                    </Text>
                  ) : null}

                  <Text style={styles.addressText}>
                    {[
                      selectedAddress.city,
                      selectedAddress.state,
                      selectedAddress.postal_code,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>
            Select pickup date
          </Text>

          <Text style={styles.sectionSubtitle}>
            Choose when you would like us to collect your laundry.
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateRow}>
            {pickupDateChoices.map(date => {
              const selected =
                date.key ===
                selectedPickupDateKey;

              return (
                <TouchableOpacity
                  key={date.key}
                  style={[
                    styles.dateCard,
                    selected &&
                      styles.dateCardSelected,
                  ]}
                  onPress={() =>
                    onChoosePickupDate(date.key)
                  }>
                  <Text
                    style={[
                      styles.dateDay,
                      selected &&
                        styles.dateTextSelected,
                    ]}>
                    {date.dayName}
                  </Text>

                  <Text
                    style={[
                      styles.dateNumber,
                      selected &&
                        styles.dateTextSelected,
                    ]}>
                    {date.dateLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.sectionTitle}>
            Select pickup time
          </Text>

          <Text style={styles.selectedDateText}>
            {selectedPickupDate?.fullLabel ||
              'Select a date first'}
          </Text>

          <View style={styles.slotGrid}>
            {pickupSlots.map(slot => {
              const selected =
                slot.id ===
                selectedPickupSlotId;

              const unavailable =
                !selectedPickupDateKey ||
                isSlotUnavailable(
                  selectedPickupDateKey,
                  slot,
                );

              return (
                <TouchableOpacity
                  key={slot.id}
                  disabled={unavailable}
                  style={[
                    styles.slotCard,
                    selected &&
                      styles.slotCardSelected,
                    unavailable &&
                      styles.slotCardDisabled,
                  ]}
                  onPress={() =>
                    onChoosePickupSlot(slot)
                  }>
                  <Text
                    style={[
                      styles.slotTime,
                      selected &&
                        styles.slotTextSelected,
                      unavailable &&
                        styles.slotTextDisabled,
                    ]}>
                    {slot.label}
                  </Text>

                  {unavailable ? (
                    <Text
                      style={
                        styles.unavailableText
                      }>
                      Unavailable
                    </Text>
                  ) : selected ? (
                    <Text
                      style={
                        styles.selectedSlotText
                      }>
                      Selected ✓
                    </Text>
                  ) : (
                    <Text style={styles.availableText}>
                      Available
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {pickupScheduledAt &&
          pickupSlotLabel ? (
            <View
              style={styles.selectedSlotSummary}>
              <Text
                style={
                  styles.selectedSlotSummaryTitle
                }>
                ✓ Pickup selected
              </Text>

              <Text
                style={
                  styles.selectedSlotSummaryDate
                }>
                {selectedPickupDate?.fullLabel}
              </Text>

              <Text
                style={
                  styles.selectedSlotSummaryTime
                }>
                {pickupSlotLabel}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.bottomArea}>
          <TouchableOpacity
            disabled={
              !pickupScheduledAt ||
              !pickupSlotLabel
            }
            style={[
              styles.continueButton,
              (!pickupScheduledAt ||
                !pickupSlotLabel) &&
                styles.buttonDisabled,
            ]}
            onPress={onContinue}>
            <Text
              style={
                styles.continueButtonText
              }>
              Continue to Order Review
            </Text>
          </TouchableOpacity>
        </View>
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

  scrollContent: {
    paddingBottom: 130,
  },

  addressSummary: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 25,
  },

  addressTop: {
    flexDirection: 'row',
  },

  addressIcon: {
    fontSize: 24,
    marginRight: 11,
  },

  summaryLabel: {
    fontSize: 11,
    color: '#777777',
  },

  addressName: {
    marginTop: 2,
    fontWeight: '700',
  },

  addressText: {
    marginTop: 2,
    fontSize: 12,
    color: '#666666',
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
  },

  sectionSubtitle: {
    fontSize: 13,
    color: '#666666',
    marginTop: 4,
    marginBottom: 15,
  },

  dateRow: {
    paddingBottom: 25,
  },

  dateCard: {
    width: 92,
    height: 82,
    borderWidth: 1,
    borderColor: '#DEDEDE',
    borderRadius: 14,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dateCardSelected: {
    backgroundColor: '#111111',
    borderColor: '#111111',
  },

  dateDay: {
    fontSize: 13,
    fontWeight: '600',
  },

  dateNumber: {
    marginTop: 5,
    fontSize: 15,
    fontWeight: '700',
  },

  dateTextSelected: {
    color: '#FFFFFF',
  },

  selectedDateText: {
    marginTop: 4,
    marginBottom: 15,
    color: '#666666',
  },

  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  slotCard: {
    width: '48%',
    minHeight: 82,
    borderWidth: 1,
    borderColor: '#DEDEDE',
    borderRadius: 14,
    padding: 13,
    marginBottom: 12,
  },

  slotCardSelected: {
    backgroundColor: '#111111',
    borderColor: '#111111',
  },

  slotCardDisabled: {
    backgroundColor: '#F4F4F4',
  },

  slotTime: {
    fontWeight: '700',
  },

  slotTextSelected: {
    color: '#FFFFFF',
  },

  slotTextDisabled: {
    color: '#AAAAAA',
  },

  availableText: {
    marginTop: 6,
    fontSize: 11,
    color: '#777777',
  },

  unavailableText: {
    marginTop: 6,
    fontSize: 11,
    color: '#AAAAAA',
  },

  selectedSlotText: {
    marginTop: 6,
    fontSize: 11,
    color: '#DDDDDD',
  },

  selectedSlotSummary: {
    backgroundColor: '#F7F7F7',
    borderRadius: 16,
    padding: 17,
    marginTop: 8,
  },

  selectedSlotSummaryTitle: {
    fontWeight: '700',
  },

  selectedSlotSummaryDate: {
    marginTop: 6,
    fontWeight: '600',
  },

  selectedSlotSummaryTime: {
    marginTop: 3,
    color: '#555555',
  },

  bottomArea: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 10,
    paddingTop: 10,
    backgroundColor: '#FFFFFF',
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