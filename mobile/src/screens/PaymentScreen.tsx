import React, {
  useState,
} from 'react';

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

import TermsAndConditionsModal
  from '../components/TermsAndConditionsModal';

import type {
  PaymentMethod,
} from '../types/payment';

import type {
  CheckoutPricing,
} from '../utils/orderPricing';

import {
  formatMoney,
} from '../utils/orderPricing';

type PaymentScreenProps = {
  pricing:
    CheckoutPricing;

  selectedPaymentMethod:
    PaymentMethod | null;

  termsAccepted:
    boolean;

  placingOrder:
    boolean;

  onBack:
    () => void;

  onSelectPaymentMethod: (
    method: PaymentMethod,
  ) => void;

  onTermsAcceptedChange: (
    value: boolean,
  ) => void;

  onPlaceOrder:
    () => void;
};

export default function PaymentScreen({
  pricing,
  selectedPaymentMethod,
  termsAccepted,
  placingOrder,
  onBack,
  onSelectPaymentMethod,
  onTermsAcceptedChange,
  onPlaceOrder,
}: PaymentScreenProps) {
  const [
    termsVisible,
    setTermsVisible,
  ] =
    useState(false);

  const disabled =
    !selectedPaymentMethod ||
    !termsAccepted ||
    placingOrder;

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
              placingOrder
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
            Payment
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
          }
          showsVerticalScrollIndicator={
            false
          }>
          <Text
            style={
              styles.sectionTitle
            }>
            Price Summary
          </Text>

          <View
            style={
              styles.totalCard
            }>
            <View
              style={
                styles.summaryRow
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
                styles.summaryRow
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

            <View
              style={
                styles.summaryRow
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

            {pricing.discountAmount > 0 ? <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Coupons & points discount</Text>
              <Text style={styles.summaryValue}>−₹{formatMoney(pricing.discountAmount)}</Text>
            </View> : null}

            <View
              style={
                styles.summaryDivider
              }
            />

            <View
              style={
                styles.summaryRow
              }>
              <Text
                style={
                  styles.grandTotalLabel
                }>
                Grand Total
              </Text>

              <Text
                style={
                  styles.grandTotalValue
                }>
                ₹
                {formatMoney(
                  pricing.grandTotal,
                )}
              </Text>
            </View>
          </View>

          <Text
            style={
              styles.heading
            }>
            Select payment method
          </Text>

          <TouchableOpacity
            disabled={
              placingOrder
            }
            style={[
              styles.paymentMethodCard,

              selectedPaymentMethod ===
                'cash_on_delivery' &&
                styles.paymentMethodSelected,
            ]}
            onPress={() =>
              onSelectPaymentMethod(
                'cash_on_delivery',
              )
            }>
            <View
              style={
                styles.radioOuter
              }>
              {selectedPaymentMethod ===
              'cash_on_delivery' ? (
                <View
                  style={
                    styles.radioInner
                  }
                />
              ) : null}
            </View>

            <View
              style={
                styles.methodIcon
              }>
              <Text
                style={
                  styles.methodEmoji
                }>
                💵
              </Text>
            </View>

            <View
              style={
                styles.flex
              }>
              <Text
                style={
                  styles.methodTitle
                }>
                Cash on Delivery
              </Text>

              <Text
                style={
                  styles.methodText
                }>
                Pay according to the supported cash-on-delivery workflow.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={
              placingOrder
            }
            style={[
              styles.paymentMethodCard,

              selectedPaymentMethod ===
                'razorpay' &&
                styles.paymentMethodSelected,
            ]}
            onPress={() =>
              onSelectPaymentMethod(
                'razorpay',
              )
            }>
            <View
              style={
                styles.radioOuter
              }>
              {selectedPaymentMethod ===
              'razorpay' ? (
                <View
                  style={
                    styles.radioInner
                  }
                />
              ) : null}
            </View>

            <View
              style={
                styles.methodIcon
              }>
              <Text
                style={
                  styles.methodEmoji
                }>
                💳
              </Text>
            </View>

            <View
              style={
                styles.flex
              }>
              <Text
                style={
                  styles.methodTitle
                }>
                Online Payment
              </Text>

              <Text
                style={
                  styles.methodText
                }>
                Pay securely through the configured payment workflow.
              </Text>

              <View
                style={
                  styles.testModeBadge
                }>
                <Text
                  style={
                    styles.testModeBadgeText
                  }>
                  ONLINE PAYMENT
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          <Text
            style={
              styles.termsHeading
            }>
            Customer Consent
          </Text>

          <View
            style={
              styles.consentContainer
            }>
            <TouchableOpacity
              disabled={
                placingOrder
              }
              activeOpacity={
                0.8
              }
              style={
                styles.checkboxTouchArea
              }
              onPress={() =>
                onTermsAcceptedChange(
                  !termsAccepted,
                )
              }>
              <View
                style={[
                  styles.checkbox,

                  termsAccepted &&
                    styles.checkboxChecked,
                ]}>
                {termsAccepted ? (
                  <Text
                    style={
                      styles.checkmark
                    }>
                    ✓
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>

            <View
              style={
                styles.termsTextContainer
              }>
              <Text
                style={
                  styles.termsText
                }>
                I agree to the{' '}
              </Text>

              <TouchableOpacity
                activeOpacity={
                  0.7
                }
                onPress={() =>
                  setTermsVisible(
                    true,
                  )
                }>
                <Text
                  style={
                    styles.termsLink
                  }>
                  Terms & Conditions
                </Text>
              </TouchableOpacity>

              <Text
                style={
                  styles.termsText
                }>
                {' '}and Service Policy.
              </Text>
            </View>
          </View>

          <Text
            style={
              styles.termsHelpText
            }>
            Tap "Terms & Conditions" to read the full document. Opening it does not automatically accept it.
          </Text>

          {!termsAccepted ? (
            <Text
              style={
                styles.termsRequired
              }>
              You must actively select the checkbox before placing the order.
            </Text>
          ) : (
            <Text
              style={
                styles.termsAcceptedText
              }>
              ✓ Terms accepted for this order.
            </Text>
          )}

          <View
            style={
              styles.infoCard
            }>
            <Text
              style={
                styles.infoTitle
              }>
              🔒 Secure checkout
            </Text>

            <Text
              style={
                styles.infoText
              }>
              The server recalculates and verifies the final order amount before creating your order.
            </Text>
          </View>
        </ScrollView>

        <View
          style={
            styles.bottomArea
          }>
          <TouchableOpacity
            disabled={
              disabled
            }
            style={[
              styles.placeOrderButton,

              disabled &&
                styles.buttonDisabled,
            ]}
            onPress={
              onPlaceOrder
            }>
            {placingOrder ? (
              <View
                style={
                  styles.loadingRow
                }>
                <ActivityIndicator
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.loadingText
                  }>
                  Processing...
                </Text>
              </View>
            ) : (
              <Text
                style={
                  styles.placeOrderButtonText
                }>
                {selectedPaymentMethod ===
                'razorpay'
                  ? `Pay ₹${formatMoney(
                      pricing.grandTotal,
                    )}`
                  : `Place Order • ₹${formatMoney(
                      pricing.grandTotal,
                    )}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TermsAndConditionsModal
          visible={
            termsVisible
          }
          onClose={() =>
            setTermsVisible(
              false,
            )
          }
        />
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
        160,
    },

    sectionTitle: {
      fontSize: 16,
      fontWeight:
        '700',
      marginBottom: 9,
    },

    totalCard: {
      backgroundColor:
        '#111111',
      borderRadius: 18,
      padding: 20,
      marginBottom: 25,
    },

    summaryRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      marginBottom: 10,
    },

    summaryLabel: {
      color:
        '#CCCCCC',
      fontSize: 13,
    },

    summaryValue: {
      color:
        '#FFFFFF',
      fontSize: 14,
      fontWeight:
        '700',
    },

    summaryDivider: {
      height: 1,
      backgroundColor:
        '#333333',
      marginVertical: 8,
    },

    grandTotalLabel: {
      color:
        '#FFFFFF',
      fontSize: 16,
      fontWeight:
        '800',
    },

    grandTotalValue: {
      color:
        '#FFFFFF',
      fontSize: 24,
      fontWeight:
        '800',
    },

    heading: {
      fontSize: 19,
      fontWeight:
        '700',
      marginBottom: 15,
    },

    paymentMethodCard: {
      borderWidth: 1,
      borderColor:
        '#E3E3E3',
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    paymentMethodSelected: {
      borderWidth: 2,
      borderColor:
        '#111111',
    },

    radioOuter: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor:
        '#111111',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginRight: 12,
    },

    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor:
        '#111111',
    },

    methodIcon: {
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

    methodEmoji: {
      fontSize: 21,
    },

    methodTitle: {
      fontWeight:
        '700',
      fontSize: 15,
    },

    methodText: {
      marginTop: 3,
      fontSize: 12,
      lineHeight: 17,
      color:
        '#666666',
    },

    testModeBadge: {
      alignSelf:
        'flex-start',
      backgroundColor:
        '#EEEEEE',
      borderRadius: 6,
      paddingHorizontal:
        7,
      paddingVertical:
        4,
      marginTop: 8,
    },

    testModeBadgeText: {
      fontSize: 9,
      fontWeight:
        '700',
    },

    termsHeading: {
      fontSize: 15,
      fontWeight:
        '700',
      marginTop: 10,
      marginBottom: 10,
    },

    consentContainer: {
      flexDirection:
        'row',
      alignItems:
        'flex-start',
    },

    checkboxTouchArea: {
      paddingRight: 10,
      paddingBottom: 8,
    },

    checkbox: {
      width: 22,
      height: 22,
      borderWidth: 1.5,
      borderColor:
        '#111111',
      borderRadius: 5,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    checkboxChecked: {
      backgroundColor:
        '#111111',
    },

    checkmark: {
      color:
        '#FFFFFF',
      fontSize: 14,
      fontWeight:
        '800',
    },

    termsTextContainer: {
      flex: 1,
      flexDirection:
        'row',
      flexWrap:
        'wrap',
      paddingTop: 2,
    },

    termsText: {
      fontSize: 12,
      lineHeight: 18,
      color:
        '#444444',
    },

    termsLink: {
      fontSize: 12,
      lineHeight: 18,
      color:
        '#111111',
      fontWeight:
        '800',
      textDecorationLine:
        'underline',
    },

    termsHelpText: {
      marginTop: 7,
      marginLeft: 32,
      fontSize: 10,
      lineHeight: 15,
      color:
        '#777777',
    },

    termsRequired: {
      marginTop: 6,
      marginLeft: 32,
      fontSize: 10,
      lineHeight: 15,
      color:
        '#777777',
    },

    termsAcceptedText: {
      marginTop: 6,
      marginLeft: 32,
      fontSize: 10,
      lineHeight: 15,
      color:
        '#333333',
      fontWeight:
        '700',
    },

    infoCard: {
      backgroundColor:
        '#F7F7F7',
      borderRadius: 14,
      padding: 15,
      marginTop: 20,
    },

    infoTitle: {
      fontWeight:
        '700',
    },

    infoText: {
      marginTop: 5,
      fontSize: 11,
      lineHeight: 16,
      color:
        '#666666',
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

    placeOrderButton: {
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

    placeOrderButtonText: {
      color:
        '#FFFFFF',
      fontSize: 16,
      fontWeight:
        '700',
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

    loadingText: {
      color:
        '#FFFFFF',
      marginLeft: 10,
      fontWeight:
        '700',
    },
  });
