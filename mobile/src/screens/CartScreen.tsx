import React, {
  useMemo,
} from 'react';

import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  calculateCheckoutPricing,
  formatMoney,
} from '../utils/orderPricing';
import type {CheckoutPricingPolicy} from '../utils/orderPricing';

type CartItem = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  description: string | null;
  pricingUnit: string;
  price: number | null;
  facilityId: string | null;
  quantity: number;
};

type CartScreenProps = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  pricingPolicy?: CheckoutPricingPolicy;

  onBack: () => void;
  onHome: () => void;
  onBrowseServices: () => void;
  onContinue: () => void;

  onUpdateQuantity: (
    item: CartItem,
    change: number,
  ) => void;
};

export default function CartScreen({
  items,
  itemCount,
  subtotal,
  pricingPolicy,
  onBack,
  onHome,
  onBrowseServices,
  onContinue,
  onUpdateQuantity,
}: CartScreenProps) {
  const pricing =
    useMemo(
      () =>
        calculateCheckoutPricing(
          subtotal,
          0,
          pricingPolicy,
        ),
      [
        subtotal,
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
            Your Cart
          </Text>

          <TouchableOpacity
            onPress={
              onHome
            }>
            <Text
              style={
                styles.homeLink
              }>
              Home
            </Text>
          </TouchableOpacity>
        </View>

        {items.length ===
        0 ? (
          <View
            style={
              styles.emptyContainer
            }>
            <Text
              style={
                styles.emptyEmoji
              }>
              🛒
            </Text>

            <Text
              style={
                styles.emptyTitle
              }>
              Your cart is empty
            </Text>

            <Text
              style={
                styles.emptyText
              }>
              Add laundry services to continue.
            </Text>

            <TouchableOpacity
              style={
                styles.button
              }
              onPress={
                onBrowseServices
              }>
              <Text
                style={
                  styles.buttonText
                }>
                Browse Services
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView
              style={
                styles.flex
              }
              contentContainerStyle={
                styles.scrollContent
              }>
              <Text
                style={
                  styles.summaryTitle
                }>
                {itemCount}{' '}
                {itemCount ===
                1
                  ? 'item'
                  : 'items'}
              </Text>

              {items.map(
                item => (
                  <View
                    key={
                      item.id
                    }
                    style={
                      styles.itemCard
                    }>
                    <View
                      style={
                        styles.itemTop
                      }>
                      <View
                        style={
                          styles.itemInfo
                        }>
                        <Text
                          style={
                            styles.category
                          }>
                          {
                            item.categoryName
                          }
                        </Text>

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
                            styles.itemUnit
                          }>
                          ₹
                          {formatMoney(
                            item.price ??
                              0,
                          )}{' '}
                          per{' '}
                          {
                            item.pricingUnit
                          }
                        </Text>
                      </View>

                      <Text
                        style={
                          styles.lineTotal
                        }>
                        ₹
                        {formatMoney(
                          (item.price ??
                            0) *
                            item.quantity,
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.quantityRow
                      }>
                      <TouchableOpacity
                        style={
                          styles.quantityButton
                        }
                        onPress={() =>
                          onUpdateQuantity(
                            item,
                            -1,
                          )
                        }>
                        <Text
                          style={
                            styles.quantityButtonText
                          }>
                          −
                        </Text>
                      </TouchableOpacity>

                      <Text
                        style={
                          styles.quantityValue
                        }>
                        {
                          item.quantity
                        }
                      </Text>

                      <TouchableOpacity
                        style={
                          styles.quantityButton
                        }
                        onPress={() =>
                          onUpdateQuantity(
                            item,
                            1,
                          )
                        }>
                        <Text
                          style={
                            styles.quantityButtonText
                          }>
                          +
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ),
              )}
            </ScrollView>

            <View
              style={
                styles.checkoutCard
              }>
              {!pricing.hasFreeDelivery ? (
                <View
                  style={
                    styles.deliveryBanner
                  }>
                  <Text
                    style={
                      styles.deliveryBannerTitle
                    }>
                    Add ₹
                    {formatMoney(
                      pricing.amountUntilFreeDelivery,
                    )}{' '}
                    more for FREE pickup & delivery
                  </Text>
                </View>
              ) : (
                <View
                  style={
                    styles.freeDeliveryBanner
                  }>
                  <Text
                    style={
                      styles.freeDeliveryText
                    }>
                    ✓ FREE pickup & delivery
                  </Text>
                </View>
              )}

              <View
                style={
                  styles.summaryRow
                }>
                <Text
                  style={
                    styles.checkoutLabel
                  }>
                  Service Subtotal
                </Text>

                <Text
                  style={
                    styles.checkoutValue
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
                    styles.checkoutLabel
                  }>
                  Pickup & Delivery
                </Text>

                <Text
                  style={
                    styles.checkoutValue
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
                    styles.checkoutLabel
                  }>
                  GST @{' '}
                  {
                    pricing.gstRate
                  }
                  %
                </Text>

                <Text
                  style={
                    styles.checkoutValue
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
                    styles.checkoutTotal
                  }>
                  ₹
                  {formatMoney(
                    pricing.grandTotal,
                  )}
                </Text>
              </View>

              <Text
                style={
                  styles.checkoutNote
                }>
                Estimated checkout pricing. Final prices and totals are recalculated by the server when the order is created.
              </Text>
              {subtotal < (pricingPolicy?.minimumOrderAmount ?? 0) ? <Text accessibilityRole="alert">
                Minimum order ₹{formatMoney(pricingPolicy!.minimumOrderAmount)}. Add more services to continue.
              </Text> : null}

              <TouchableOpacity
                disabled={subtotal < (pricingPolicy?.minimumOrderAmount ?? 0)}
                style={
                  styles.checkoutButton
                }
                onPress={
                  onContinue
                }>
                <Text
                  style={
                    styles.checkoutButtonText
                  }>
                  Continue • ₹
                  {formatMoney(
                    pricing.grandTotal,
                  )}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
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

    homeLink: {
      fontSize: 15,
      fontWeight:
        '600',
      minWidth: 60,
      textAlign:
        'right',
    },

    scrollContent: {
      paddingBottom:
        20,
    },

    summaryTitle: {
      fontSize: 14,
      color:
        '#666666',
      marginBottom:
        15,
    },

    itemCard: {
      borderBottomWidth:
        1,
      borderBottomColor:
        '#EEEEEE',
      paddingVertical:
        17,
    },

    itemTop: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
    },

    itemInfo: {
      flex: 1,
    },

    category: {
      color:
        '#888888',
      fontSize: 11,
    },

    itemName: {
      fontSize: 16,
      fontWeight:
        '600',
    },

    itemUnit: {
      color:
        '#777777',
      fontSize: 12,
    },

    lineTotal: {
      fontSize: 17,
      fontWeight:
        '700',
    },

    quantityRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginTop: 14,
    },

    quantityButton: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        '#D7D7D7',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    quantityButtonText: {
      fontSize: 20,
    },

    quantityValue: {
      minWidth: 36,
      textAlign:
        'center',
      fontSize: 16,
      fontWeight:
        '700',
    },

    checkoutCard: {
      paddingTop: 12,
      paddingBottom: 10,
    },

    deliveryBanner: {
      backgroundColor:
        '#F4F4F4',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: 12,
    },

    deliveryBannerTitle: {
      fontSize: 11,
      lineHeight: 16,
      fontWeight:
        '700',
      color:
        '#333333',
    },

    freeDeliveryBanner: {
      backgroundColor:
        '#F4F4F4',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: 12,
    },

    freeDeliveryText: {
      fontSize: 11,
      fontWeight:
        '700',
      color:
        '#222222',
    },

    summaryRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      marginBottom: 7,
    },

    checkoutLabel: {
      fontSize: 13,
      color:
        '#666666',
    },

    checkoutValue: {
      fontSize: 13,
      fontWeight:
        '700',
    },

    totalDivider: {
      height: 1,
      backgroundColor:
        '#E8E8E8',
      marginVertical: 5,
    },

    grandTotalLabel: {
      fontSize: 16,
      fontWeight:
        '800',
    },

    checkoutTotal: {
      fontSize: 22,
      fontWeight:
        '800',
    },

    checkoutNote: {
      fontSize: 10,
      lineHeight: 15,
      color:
        '#777777',
      marginVertical: 9,
    },

    checkoutButton: {
      backgroundColor:
        '#111111',
      borderRadius: 13,
      paddingVertical: 16,
      alignItems:
        'center',
    },

    checkoutButtonText: {
      color:
        '#FFFFFF',
      fontSize: 16,
      fontWeight:
        '700',
    },

    emptyContainer: {
      flex: 1,
      justifyContent:
        'center',
      alignItems:
        'center',
      paddingHorizontal:
        30,
    },

    emptyEmoji: {
      fontSize: 48,
    },

    emptyTitle: {
      fontSize: 22,
      fontWeight:
        '700',
    },

    emptyText: {
      color:
        '#666666',
      marginBottom: 25,
    },

    button: {
      width: '100%',
      paddingVertical: 16,
      borderRadius: 12,
      alignItems:
        'center',
      backgroundColor:
        '#111111',
    },

    buttonText: {
      color:
        '#FFFFFF',
      fontSize: 17,
      fontWeight:
        '600',
    },
  });
