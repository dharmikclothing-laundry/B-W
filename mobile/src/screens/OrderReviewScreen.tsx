import React, {
  useMemo,
  useState,
} from 'react';
import CouponSection from '../components/CouponSection';
import LoyaltySection from '../components/LoyaltySection';
import PackageCheckoutSection from '../components/PackageCheckoutSection';
import type {CustomerPackage} from '../services/packagesApi';
import {packageDiscount} from '../utils/packagePricing';
import type {CouponResult} from '../services/growthApi';

import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type {
  AddressItem,
} from '../types/address';

import type {
  CartItem,
} from '../types/service';

import {
  calculateCheckoutPricing,
  formatMoney,
} from '../utils/orderPricing';
import type {CheckoutPricingPolicy} from '../utils/orderPricing';

type OrderReviewScreenProps = {
  selectedAddress:
    AddressItem | null;

  pickupDateLabel:
    string;

  pickupSlotLabel:
    string;

  cartItems:
    CartItem[];

  cartSubtotal:
    number;
  pricingPolicy?: CheckoutPricingPolicy;
  accessToken: string;
  coupon: CouponResult | null;
  onCouponChange: (coupon: CouponResult | null) => void;
  loyaltyPoints: number;
  onLoyaltyPointsChange: (points: number) => void;
  selectedPackage: CustomerPackage | null;
  onPackageChange: (value: CustomerPackage | null) => void;

  onBack: () => void;

  onChangeAddress:
    () => void;

  onChangePickupTime:
    () => void;

  onContinueToPayment:
    () => void;
};

export default function OrderReviewScreen({
  selectedAddress,
  pickupDateLabel,
  pickupSlotLabel,
  cartItems,
  cartSubtotal,
  pricingPolicy,
  accessToken,
  coupon,
  onCouponChange,
  loyaltyPoints,
  onLoyaltyPointsChange,
  selectedPackage,
  onPackageChange,
  onBack,
  onChangeAddress,
  onChangePickupTime,
  onContinueToPayment,
}: OrderReviewScreenProps) {
  const [pointsPerRupee, setPointsPerRupee] = useState(10);
  const pricing =
    useMemo(
      () =>
        calculateCheckoutPricing(
          cartSubtotal,
          Math.min(coupon?.discount ?? 0, Math.max(0, cartSubtotal - packageDiscount(selectedPackage, cartItems))) + loyaltyPoints / pointsPerRupee + packageDiscount(selectedPackage, cartItems),
          pricingPolicy,
        ),
      [
        cartSubtotal,
        coupon,
        loyaltyPoints,
        pointsPerRupee,
        selectedPackage,
        cartItems,
        pricingPolicy,
      ],
    );

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
            Order Review
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
            styles.scrollContent
          }>
          <Text
            style={
              styles.sectionTitle
            }>
            Pickup Address
          </Text>

          <View
            style={
              styles.card
            }>
            <Text
              style={
                styles.cardTitle
              }>
              {selectedAddress?.label ||
                'Pickup Address'}
            </Text>

            <Text
              style={
                styles.addressText
              }>
              {selectedAddress
                ?.address_line1 ||
                '-'}
            </Text>

            {selectedAddress
              ?.address_line2 ? (
              <Text
                style={
                  styles.addressText
                }>
                {
                  selectedAddress
                    .address_line2
                }
              </Text>
            ) : null}

            <Text
              style={
                styles.addressText
              }>
              {[
                selectedAddress?.city,
                selectedAddress?.state,
                selectedAddress?.postal_code,
              ]
                .filter(Boolean)
                .join(', ')}
            </Text>

            <TouchableOpacity
              onPress={
                onChangeAddress
              }>
              <Text
                style={
                  styles.changeLink
                }>
                Change Address
              </Text>
            </TouchableOpacity>
          </View>

          <Text
            style={
              styles.sectionTitle
            }>
            Pickup Schedule
          </Text>

          <View
            style={
              styles.card
            }>
            <View
              style={
                styles.scheduleRow
              }>
              <View
                style={
                  styles.scheduleIcon
                }>
                <Text
                  style={
                    styles.scheduleEmoji
                  }>
                  📅
                </Text>
              </View>

              <View
                style={
                  styles.flex
                }>
                <Text
                  style={
                    styles.smallLabel
                  }>
                  Pickup Date
                </Text>

                <Text
                  style={
                    styles.cardTitle
                  }>
                  {pickupDateLabel ||
                    '-'}
                </Text>
              </View>
            </View>

            <View
              style={
                styles.divider
              }
            />

            <View
              style={
                styles.scheduleRow
              }>
              <View
                style={
                  styles.scheduleIcon
                }>
                <Text
                  style={
                    styles.scheduleEmoji
                  }>
                  🕐
                </Text>
              </View>

              <View
                style={
                  styles.flex
                }>
                <Text
                  style={
                    styles.smallLabel
                  }>
                  Pickup Time
                </Text>

                <Text
                  style={
                    styles.cardTitle
                  }>
                  {pickupSlotLabel ||
                    '-'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={
                onChangePickupTime
              }>
              <Text
                style={
                  styles.changeLink
                }>
                Change Pickup Time
              </Text>
            </TouchableOpacity>
          </View>

          <Text
            style={
              styles.sectionTitle
            }>
            Laundry Items
          </Text>

          <View
            style={
              styles.card
            }>
            {cartItems.map(
              (
                item,
                index,
              ) => (
                <View
                  key={
                    item.id
                  }
                  style={[
                    styles.itemRow,

                    index <
                      cartItems.length -
                        1 &&
                      styles.itemBorder,
                  ]}>
                  <View
                    style={
                      styles.flex
                    }>
                    <Text
                      style={
                        styles.itemName
                      }>
                      {
                        item.name
                      }
                    </Text>

                    <Text
                      style={
                        styles.itemMeta
                      }>
                      {
                        item.quantity
                      }{' '}
                      × ₹
                      {formatMoney(
                        item.price ??
                          0,
                      )}
                    </Text>
                  </View>

                  <Text
                    style={
                      styles.itemAmount
                    }>
                    ₹
                    {formatMoney(
                      (item.price ??
                        0) *
                        item.quantity,
                    )}
                  </Text>
                </View>
              ),
            )}
          </View>

          <PackageCheckoutSection accessToken={accessToken} items={cartItems} selected={selectedPackage} onChange={onPackageChange} />
          <CouponSection accessToken={accessToken} subtotal={cartSubtotal - packageDiscount(selectedPackage, cartItems)} applied={coupon} onChange={onCouponChange} />
          <LoyaltySection accessToken={accessToken} subtotalAfterCoupon={Math.max(0, cartSubtotal - packageDiscount(selectedPackage, cartItems) - (coupon?.discount ?? 0))} points={loyaltyPoints} onChange={onLoyaltyPointsChange} onRateChange={setPointsPerRupee} />

          <Text style={styles.sectionTitle}>Price Summary</Text>

          <View
            style={
              styles.totalCard
            }>
            <View
              style={
                styles.totalRow
              }>
              <Text
                style={
                  styles.summaryLabel
                }>
                Service Subtotal
              </Text>

              <Text
                style={
                  styles.summaryValue
                }>
                ₹
                {formatMoney(
                  pricing.subtotal,
                )}
              </Text>
            </View>

            <View
              style={
                styles.totalRow
              }>
              <Text
                style={
                  styles.summaryLabel
                }>
                Pickup & Delivery
              </Text>

              <Text
                style={
                  styles.summaryValue
                }>
                {pricing.hasFreeDelivery
                  ? 'FREE'
                  : `₹${formatMoney(
                      pricing.pickupDeliveryCharge,
                    )}`}
              </Text>
            </View>

            {pricing.discountAmount > 0 ? <View style={styles.totalRow}>
              <Text style={styles.summaryLabel}>Package, coupons & points discount</Text>
              <Text style={styles.summaryValue}>−₹{formatMoney(pricing.discountAmount)}</Text>
            </View> : null}

            <View
              style={
                styles.totalRow
              }>
              <Text
                style={
                  styles.summaryLabel
                }>
                GST @{' '}
                {
                  pricing.gstRate
                }
                %
              </Text>

              <Text
                style={
                  styles.summaryValue
                }>
                ₹
                {formatMoney(
                  pricing.gstAmount,
                )}
              </Text>
            </View>

            <View
              style={
                styles.totalDivider
              }
            />

            <View
              style={
                styles.totalRow
              }>
              <Text
                style={
                  styles.grandTotalLabel
                }>
                Grand Total
              </Text>

              <Text
                style={
                  styles.grandTotalAmount
                }>
                ₹
                {formatMoney(
                  pricing.grandTotal,
                )}
              </Text>
            </View>

            {!pricing.hasFreeDelivery ? (
              <Text
                style={
                  styles.freeDeliveryHint
                }>
                Add ₹
                {formatMoney(
                  pricing.amountUntilFreeDelivery,
                )}{' '}
                more in services for free pickup & delivery.
              </Text>
            ) : (
              <Text
                style={
                  styles.freeDeliveryHint
                }>
                FREE pickup & delivery applied.
              </Text>
            )}

            <Text
              style={
                styles.totalNote
              }>
              These are estimated checkout totals. The server recalculates all prices before creating the order.
            </Text>
          </View>
        </ScrollView>

        <View
          style={
            styles.bottomArea
          }>
          <TouchableOpacity
            style={
              styles.continueButton
            }
            disabled={cartSubtotal < (pricingPolicy?.minimumOrderAmount ?? 0)}
            onPress={
              onContinueToPayment
            }>
            <Text
              style={
                styles.continueButtonText
              }>
              Continue to Payment • ₹
              {formatMoney(
                pricing.grandTotal,
              )}
            </Text>
          </TouchableOpacity>
          {cartSubtotal < (pricingPolicy?.minimumOrderAmount ?? 0) ? <Text accessibilityRole="alert">Minimum order ₹{formatMoney(pricingPolicy!.minimumOrderAmount)}.</Text> : null}
        </View>
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
    },

    headerSpacer: {
      width: 60,
    },

    scrollContent: {
      paddingBottom:
        130,
    },

    sectionTitle: {
      fontSize: 16,
      fontWeight:
        '700',
      marginBottom: 9,
    },

    card: {
      borderWidth: 1,
      borderColor:
        '#E6E6E6',
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
    },

    cardTitle: {
      fontWeight:
        '700',
    },

    addressText: {
      marginTop: 3,
      color:
        '#666666',
    },

    changeLink: {
      fontSize: 12,
      fontWeight:
        '700',
      marginTop: 10,
    },

    smallLabel: {
      fontSize: 11,
      color:
        '#777777',
    },

    scheduleRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    scheduleIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor:
        '#F4F4F4',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginRight: 12,
    },

    scheduleEmoji: {
      fontSize: 19,
    },

    divider: {
      height: 1,
      backgroundColor:
        '#EEEEEE',
      marginVertical: 14,
    },

    itemRow: {
      flexDirection:
        'row',
      paddingVertical: 11,
    },

    itemBorder: {
      borderBottomWidth: 1,
      borderBottomColor:
        '#EEEEEE',
    },

    itemName: {
      fontWeight:
        '600',
    },

    itemMeta: {
      marginTop: 3,
      fontSize: 11,
      color:
        '#777777',
    },

    itemAmount: {
      fontWeight:
        '700',
    },

    totalCard: {
      backgroundColor:
        '#111111',
      borderRadius: 16,
      padding: 17,
    },

    totalRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      marginBottom: 9,
    },

    summaryLabel: {
      color:
        '#CCCCCC',
      fontSize: 12,
    },

    summaryValue: {
      color:
        '#FFFFFF',
      fontSize: 13,
      fontWeight:
        '700',
    },

    totalDivider: {
      height: 1,
      backgroundColor:
        '#333333',
      marginVertical: 5,
    },

    grandTotalLabel: {
      color:
        '#FFFFFF',
      fontSize: 15,
      fontWeight:
        '800',
    },

    grandTotalAmount: {
      color:
        '#FFFFFF',
      fontSize: 21,
      fontWeight:
        '800',
    },

    freeDeliveryHint: {
      color:
        '#FFFFFF',
      fontSize: 11,
      lineHeight: 16,
      marginTop: 8,
      fontWeight:
        '600',
    },

    totalNote: {
      color:
        '#BBBBBB',
      fontSize: 10,
      lineHeight: 15,
      marginTop: 8,
    },

    bottomArea: {
      position:
        'absolute',
      left: 20,
      right: 20,
      bottom: 10,
      paddingTop: 10,
      backgroundColor:
        '#FFFFFF',
    },

    continueButton: {
      minHeight: 52,
      backgroundColor:
        '#111111',
      borderRadius: 13,
      paddingVertical: 16,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    continueButtonText: {
      color:
        '#FFFFFF',
      fontSize: 15,
      fontWeight:
        '700',
    },
  });
