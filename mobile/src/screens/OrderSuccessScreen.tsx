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

import type {
  SuccessfulOrder,
} from '../types/order';

import {
  formatMoney,
} from '../utils/orderPricing';

type OrderSuccessScreenProps = {
  order:
    SuccessfulOrder;

  onBackHome:
    () => void;

  onViewOrders:
    () => void;
};

export default function OrderSuccessScreen({
  order,
  onBackHome,
  onViewOrders,
}: OrderSuccessScreenProps) {
  return (
    <SafeAreaView
      style={
        styles.container
      }>
      <StatusBar
        barStyle="dark-content"
      />

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }>
        <View
          style={
            styles.successIcon
          }>
          <Text
            style={
              styles.successIconText
            }>
            ✓
          </Text>
        </View>

        <Text
          style={
            styles.title
          }>
          Order Confirmed
        </Text>

        <Text
          style={
            styles.subtitle
          }>
          Your laundry pickup has been scheduled successfully.
        </Text>

        <View
          style={
            styles.card
          }>
          {order.orderNumber ? (
            <>
              <View
                style={
                  styles.row
                }>
                <Text
                  style={
                    styles.label
                  }>
                  Order Number
                </Text>

                <Text
                  style={
                    styles.value
                  }>
                  {
                    order.orderNumber
                  }
                </Text>
              </View>

              <View
                style={
                  styles.divider
                }
              />
            </>
          ) : null}

          <View
            style={
              styles.row
            }>
            <Text
              style={
                styles.label
              }>
              Status
            </Text>

            <Text
              style={
                styles.value
              }>
              {
                order.status
              }
            </Text>
          </View>

          <View
            style={
              styles.divider
            }
          />

          <View
            style={
              styles.row
            }>
            <Text
              style={
                styles.label
              }>
              Pickup
            </Text>

            <View
              style={
                styles.right
              }>
              <Text
                style={
                  styles.value
                }>
                {
                  order.pickupDateLabel
                }
              </Text>

              <Text
                style={
                  styles.subValue
                }>
                {
                  order.pickupSlotLabel
                }
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
              styles.row
            }>
            <Text
              style={
                styles.label
              }>
              Payment
            </Text>

            <Text
              style={
                styles.value
              }>
              {order.paymentMethod ===
              'cash_on_delivery'
                ? 'Cash on Delivery'
                : 'Online Payment'}
            </Text>
          </View>
        </View>

        <Text
          style={
            styles.sectionTitle
          }>
          Payment Summary
        </Text>

        <View
          style={
            styles.priceCard
          }>
          <View
            style={
              styles.priceRow
            }>
            <Text
              style={
                styles.priceLabel
              }>
              Service Subtotal
            </Text>

            <Text
              style={
                styles.priceValue
              }>
              ₹
              {formatMoney(
                order.subtotal,
              )}
            </Text>
          </View>

          <View
            style={
              styles.priceRow
            }>
            <Text
              style={
                styles.priceLabel
              }>
              Pickup & Delivery
            </Text>

            <Text
              style={
                styles.priceValue
              }>
              {order.pickupDeliveryCharge ===
              0
                ? 'FREE'
                : `₹${formatMoney(
                    order.pickupDeliveryCharge,
                  )}`}
            </Text>
          </View>

          <View
            style={
              styles.priceRow
            }>
            <Text
              style={
                styles.priceLabel
              }>
              GST @{' '}
              {
                order.gstRate
              }
              %
            </Text>

            <Text
              style={
                styles.priceValue
              }>
              ₹
              {formatMoney(
                order.gstAmount,
              )}
            </Text>
          </View>

          <View
            style={
              styles.priceDivider
            }
          />

          <View
            style={
              styles.priceRow
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
                order.totalAmount,
              )}
            </Text>
          </View>
        </View>

        <Text
          style={
            styles.serverNote
          }>
          These totals were confirmed by the server when your order was created.
        </Text>

        <TouchableOpacity
          style={
            styles.primaryButton
          }
          onPress={
            onBackHome
          }>
          <Text
            style={
              styles.primaryButtonText
            }>
            Back to Home
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={
            styles.secondaryButton
          }
          onPress={
            onViewOrders
          }>
          <Text
            style={
              styles.secondaryButtonText
            }>
            View Your Orders
          </Text>
        </TouchableOpacity>
      </ScrollView>
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

    content: {
      flexGrow: 1,
      justifyContent:
        'center',
      paddingHorizontal:
        28,
      paddingVertical:
        30,
    },

    successIcon: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor:
        '#111111',
      alignItems:
        'center',
      justifyContent:
        'center',
      alignSelf:
        'center',
      marginBottom: 22,
    },

    successIconText: {
      color:
        '#FFFFFF',
      fontSize: 38,
      fontWeight:
        '700',
    },

    title: {
      fontSize: 28,
      fontWeight:
        '800',
      textAlign:
        'center',
    },

    subtitle: {
      color:
        '#666666',
      textAlign:
        'center',
      lineHeight: 20,
      marginVertical:
        15,
    },

    card: {
      borderWidth: 1,
      borderColor:
        '#E5E5E5',
      borderRadius: 18,
      padding: 18,
      marginBottom: 20,
    },

    row: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'flex-start',
    },

    label: {
      fontSize: 12,
      color:
        '#777777',
      marginRight: 15,
    },

    value: {
      flexShrink: 1,
      fontWeight:
        '700',
      textAlign:
        'right',
    },

    right: {
      flex: 1,
      alignItems:
        'flex-end',
    },

    subValue: {
      marginTop: 3,
      fontSize: 12,
      color:
        '#666666',
      textAlign:
        'right',
    },

    divider: {
      height: 1,
      backgroundColor:
        '#EEEEEE',
      marginVertical: 13,
    },

    sectionTitle: {
      fontSize: 15,
      fontWeight:
        '700',
      marginBottom: 9,
    },

    priceCard: {
      backgroundColor:
        '#111111',
      borderRadius: 18,
      padding: 18,
    },

    priceRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      marginBottom: 9,
    },

    priceLabel: {
      color:
        '#CCCCCC',
      fontSize: 12,
    },

    priceValue: {
      color:
        '#FFFFFF',
      fontSize: 13,
      fontWeight:
        '700',
    },

    priceDivider: {
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

    grandTotalValue: {
      color:
        '#FFFFFF',
      fontSize: 21,
      fontWeight:
        '800',
    },

    serverNote: {
      fontSize: 10,
      color:
        '#777777',
      lineHeight: 15,
      marginTop: 8,
      marginBottom: 20,
    },

    primaryButton: {
      width: '100%',
      minHeight: 52,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#111111',
    },

    primaryButtonText: {
      color:
        '#FFFFFF',
      fontSize: 17,
      fontWeight:
        '600',
    },

    secondaryButton: {
      marginTop: 12,
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        '#111111',
    },

    secondaryButtonText: {
      fontSize: 15,
      fontWeight:
        '700',
    },
  });