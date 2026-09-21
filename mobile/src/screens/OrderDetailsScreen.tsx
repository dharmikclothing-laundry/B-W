import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {formatPaymentMethod, customerTimelineReason} from '../utils/customerPresentation';
import {getMyAddresses} from '../services/customersApi';
import type {AddressItem} from '../types/address';
import LoadingView from '../components/LoadingView';
import OrderCareSection from '../components/OrderCareSection';
import OrderStatusBadge from '../components/OrderStatusBadge';
import OrderQrCard from '../components/OrderQrCard';

import {
  getOrder,
  getOrderStatusHistory,
} from '../services/ordersApi';
import {
  createCustomerOrderOtp,
  CustomerOrderOtp,
  getCustomerOtpTypeForStatus,
} from '../services/orderOtpApi';
import {
  canCustomerTrackOrder,
  getOrderTracking,
  hasLiveDriverLocation,
  OrderTracking,
} from '../services/orderTrackingApi';

import {
  CustomerOrder,
  OrderStatusHistoryItem,
  orderStatusLabel,
} from '../types/order';

type OrderDetailsScreenProps = {
  accessToken:
    string;

  orderId:
    string;

  onBack:
    () => void;
  onReceipt: (orderId: string) => void;
  onReorder: (order: CustomerOrder) => void;
};

function formatMoney(
  value:
    | number
    | string
    | null
    | undefined,
) {
  const amount =
    Number(
      value ?? 0,
    );

  if (
    Number.isNaN(
      amount,
    )
  ) {
    return '0.00';
  }

  return amount.toFixed(
    2,
  );
}

function formatDateTime(
  value?: string | null,
) {
  if (!value) {
    return '-';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '-';
  }

  return date.toLocaleString(
    'en-IN',
    {
      weekday:
        'short',

      day:
        '2-digit',

      month:
        'short',

      year:
        'numeric',

      hour:
        'numeric',

      minute:
        '2-digit',
    },
  );
}

function getHistoryStatus(
  item:
    OrderStatusHistoryItem,
) {
  return (
    item.new_status ??
    item.to_status ??
    item.status ??
    null
  );
}

export default function OrderDetailsScreen({
  accessToken,
  orderId,
  onBack,
  onReceipt,
  onReorder,
}: OrderDetailsScreenProps) {
  const [
    order,
    setOrder,
  ] =
    useState<
      CustomerOrder | null
    >(null);

  const [
    history,
    setHistory,
  ] =
    useState<
      OrderStatusHistoryItem[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
    string | null
    >(null);

  const [
    customerOtp,
    setCustomerOtp,
  ] = useState<
    CustomerOrderOtp | null
  >(null);

  const [
    otpLoading,
    setOtpLoading,
  ] = useState(false);

  const [
    otpError,
    setOtpError,
  ] = useState<
    string | null
  >(null);

  const [
    tracking,
    setTracking,
  ] = useState<OrderTracking | null>(null);

  const [
    trackingLoading,
    setTrackingLoading,
  ] = useState(false);

  const [
    trackingError,
    setTrackingError,
  ] = useState<string | null>(null);

  const [careRefreshKey, setCareRefreshKey] = useState(0);

  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  useEffect(() => {
    let active = true;
    getMyAddresses(accessToken).then(result => {if (active) setAddresses(result);}).catch(() => {});
    return () => {active = false;};
  }, [accessToken]);
  const addressText = (id: string) => {
    const address = addresses.find(item => item.id === id);
    return address ? [address.address_line1, address.address_line2, address.city, address.state, address.postal_code].filter(Boolean).join(', ') : 'Saved address details unavailable';
  };

  const loadDetails =
    useCallback(
      async (
        isRefresh =
          false,
      ) => {
        try {
          if (
            isRefresh
          ) {
            setRefreshing(
              true,
            );
          } else {
            setLoading(
              true,
            );
          }

          setError(
            null,
          );

          const [
            orderResult,
            historyResult,
          ] =
            await Promise.all([
              getOrder(
                accessToken,
                orderId,
              ),

              getOrderStatusHistory(
                accessToken,
                orderId,
              ),
            ]);

          setOrder(
            orderResult,
          );

          setHistory(
            historyResult,
          );
          setCareRefreshKey(value => value + 1);
        } catch (
          loadError: any
        ) {
          setError(
            loadError?.message ||
              'Unable to load order details.',
          );
        } finally {
          setLoading(
            false,
          );

          setRefreshing(
            false,
          );
        }
      },
      [
        accessToken,
        orderId,
      ],
    );

  useEffect(
    () => {
      loadDetails();
    },
    [
      loadDetails,
    ],
  );

  const itemCount =
    useMemo(
      () => {
        return (
          order?.order_items ??
          []
        ).reduce(
          (
            total,
            item,
          ) =>
            total +
            Number(
              item.quantity,
            ),
          0,
        );
      },
      [
        order,
      ],
    );

  const otpType =
    getCustomerOtpTypeForStatus(
      order?.current_status ?? '',
    );

  const trackingEnabled =
    canCustomerTrackOrder(
      order?.current_status ?? '',
    );

  const liveLocationEnabled =
    hasLiveDriverLocation(
      order?.current_status ?? '',
    );

  const loadTracking =
    useCallback(
      async () => {
        if (!trackingEnabled) {
          setTracking(null);
          setTrackingError(null);
          return;
        }

        try {
          setTrackingLoading(true);
          setTrackingError(null);
          setTracking(
            await getOrderTracking(
              accessToken,
              orderId,
            ),
          );
        } catch (trackingLoadError: any) {
          setTracking(null);
          setTrackingError(
            trackingLoadError?.message ||
              'Tracking is temporarily unavailable. Check your connection and try again.',
          );
        } finally {
          setTrackingLoading(false);
        }
      }, [
        accessToken,
        orderId,
        trackingEnabled,
      ]);

  useEffect(
    () => {
      loadTracking();

      if (!liveLocationEnabled) {
        return undefined;
      }

      const interval = setInterval(
        loadTracking,
        30_000,
      );
      return () => clearInterval(interval);
    }, [
      liveLocationEnabled,
      loadTracking,
    ]);

  useEffect(
    () => {
      if (
        customerOtp &&
        customerOtp.otpType !== otpType
      ) {
        setCustomerOtp(null);
        setOtpError(null);
      }
    }, [
      customerOtp,
      otpType,
    ]);

  const showOtp =
    useCallback(
      async () => {
        if (!otpType) {
          return;
        }

        try {
          setOtpLoading(true);
          setOtpError(null);
          const result =
            await createCustomerOrderOtp(
              accessToken,
              orderId,
              otpType,
            );
          setCustomerOtp(result);
        } catch (requestError: any) {
          setCustomerOtp(null);
          setOtpError(
            requestError?.message ||
              'Unable to retrieve your OTP. Please try again.',
          );
        } finally {
          setOtpLoading(false);
        }
      }, [
        accessToken,
        orderId,
        otpType,
      ]);

  if (
    loading
  ) {
    return (
      <SafeAreaView
        style={
          styles.container
        }>
        <View
          style={
            styles.header
          }>
          <TouchableOpacity
            onPress={
              onBack
            }>
            <Text
              style={
                styles.back
              }>
              ← Back
            </Text>
          </TouchableOpacity>

          <Text
            style={
              styles.headerTitle
            }>
            Order Details
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <LoadingView
          message="Loading order details..."
        />
      </SafeAreaView>
    );
  }

  if (
    error ||
    !order
  ) {
    return (
      <SafeAreaView
        style={
          styles.container
        }>
        <View
          style={
            styles.header
          }>
          <TouchableOpacity
            onPress={
              onBack
            }>
            <Text
              style={
                styles.back
              }>
              ← Back
            </Text>
          </TouchableOpacity>

          <Text
            style={
              styles.headerTitle
            }>
            Order Details
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <View
          style={
            styles.errorContainer
          }>
          <Text
            style={
              styles.errorTitle
            }>
            Unable to load order
          </Text>

          <Text
            style={
              styles.errorText
            }>
            {error ||
              'Order not found.'}
          </Text>

          <TouchableOpacity
            style={
              styles.retryButton
            }
            onPress={() =>
              loadDetails()
            }>
            <Text
              style={
                styles.retryButtonText
              }>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const pickupDeliveryCharge =
    Number(
      order.pickup_delivery_charge ??
        0,
    );

  const gstRate =
    Number(
      order.gst_rate ??
        0,
    );

  const gstAmount =
    Number(
      order.gst_amount ??
        0,
    );

  const taxableAmount =
    Number(
      order.taxable_amount ??
        order.subtotal,
    );

  return (
    <SafeAreaView
      style={
        styles.container
      }>
      <View
        style={
          styles.header
        }>
        <TouchableOpacity
          onPress={
            onBack
          }>
          <Text
            style={
              styles.back
            }>
            ← Back
          </Text>
        </TouchableOpacity>

        <Text
          style={
            styles.headerTitle
          }>
          Order Details
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={
          styles.flex
        }
        contentContainerStyle={
          styles.scrollContent
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() =>
              loadDetails(
                true,
              )
            }
          />
        }
        showsVerticalScrollIndicator={
          false
        }>
        <View
          style={
            styles.heroCard
          }>
          <View
            style={
              styles.heroTop
            }>
            <View
              style={
                styles.flex
              }>
              <Text
                style={
                  styles.orderLabel
                }>
                ORDER NUMBER
              </Text>

              <Text
                style={
                  styles.orderNumber
                }>
                {order.order_number ||
                  order.id}
              </Text>
            </View>

            <OrderStatusBadge
              status={
                order.current_status
              }
            />
          </View>

          <View
            style={
              styles.heroDivider
            }
          />

          <Text
            style={
              styles.heroStatusText
            }>
            {orderStatusLabel(
              order.current_status,
            )}
          </Text>
        </View>

        <OrderQrCard accessToken={accessToken} orderId={orderId} />

        {trackingEnabled ? (
          <View style={styles.trackingCard}>
            <Text style={styles.trackingTitle}>Order Tracking</Text>
            {trackingLoading && !tracking ? (
              <Text style={styles.trackingText}>Loading driver assignment...</Text>
            ) : null}
            {trackingError ? (
              <Text style={styles.trackingError}>{trackingError}</Text>
            ) : null}
            {tracking?.assignment ? (
              <>
                <Text style={styles.trackingText}>
                  {tracking.assignment.type === 'pickup'
                    ? 'Pickup driver assigned'
                    : 'Delivery driver assigned'}
                </Text>
                {liveLocationEnabled ? (
                  tracking.location ? (
                    <Text style={styles.trackingText}>
                      {tracking.location.stale
                        ? 'Driver location is temporarily stale. We will refresh it when a new update arrives.'
                        : `Live driver location updated ${formatDateTime(tracking.location.recordedAt)}.`}
                    </Text>
                  ) : (
                    <Text style={styles.trackingText}>Waiting for the driver location update.</Text>
                  )
                ) : (
                  <Text style={styles.trackingText}>The driver location will appear when the driver starts the trip.</Text>
                )}
                {tracking.distanceMeters != null ? (
                  <Text style={styles.trackingText}>
                    Distance: {(tracking.distanceMeters / 1000).toFixed(1)} km
                  </Text>
                ) : null}
                {tracking.etaMinutes != null ? (
                  <Text style={styles.trackingText}>ETA: {Math.round(tracking.etaMinutes)} min</Text>
                ) : null}
              </>
            ) : !trackingLoading && !trackingError ? (
              <Text style={styles.trackingText}>No active driver assignment is available yet.</Text>
            ) : null}
          </View>
        ) : null}

        {otpType ? (
          <View
            style={
              styles.otpCard
            }>
            <Text
              style={
                styles.otpTitle
              }>
              {otpType === 'pickup'
                ? 'Pickup OTP'
                : 'Delivery OTP'}
            </Text>

            <Text
              style={
                styles.otpDescription
              }>
              {otpType === 'pickup'
                ? 'Give this code to the driver only when your garments are collected.'
                : 'Give this code to the driver only when your order is delivered.'}
            </Text>

            {customerOtp ? (
              <>
                <Text
                  style={
                    styles.otpCode
                  }>
                  {customerOtp.otp}
                </Text>
                <Text
                  style={
                    styles.otpExpiry
                  }>
                  Expires {formatDateTime(customerOtp.expiresAt)}
                </Text>
              </>
            ) : (
              <TouchableOpacity
                style={
                  styles.otpButton
                }
                disabled={
                  otpLoading
                }
                onPress={
                  showOtp
                }>
                <Text
                  style={
                    styles.otpButtonText
                  }>
                  {otpLoading
                    ? 'Retrieving OTP...'
                    : `Show ${otpType === 'pickup' ? 'Pickup' : 'Delivery'} OTP`}
                </Text>
              </TouchableOpacity>
            )}

            {otpError ? (
              <Text
                style={
                  styles.otpError
                }>
                {otpError}
              </Text>
            ) : null}
          </View>
        ) : null}

        <OrderCareSection
          accessToken={accessToken}
          order={order}
          refreshKey={careRefreshKey}
          onActionComplete={() => loadDetails(true)}
        />

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
              styles.detailRow
            }>
            <Text
              style={
                styles.detailLabel
              }>
              Pickup Date & Time
            </Text>

            <Text
              style={
                styles.detailValue
              }>
              {formatDateTime(
                order.pickup_scheduled_at,
              )}
            </Text>
          </View>

          <View
            style={
              styles.divider
            }
          />

          <View
            style={
              styles.detailRow
            }>
            <Text
              style={
                styles.detailLabel
              }>
              Pickup Slot
            </Text>

            <Text
              style={
                styles.detailValue
              }>
              {order.pickup_slot_label ||
                '-'}
            </Text>
          </View>
        </View>

        <Text
          style={
            styles.sectionTitle
          }>
          Order Summary
        </Text>
        <TouchableOpacity onPress={() => onReceipt(order.id)}><Text style={styles.back}>View receipt and GST breakdown →</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => onReorder(order)}><Text style={styles.back}>Repeat this order →</Text></TouchableOpacity>

        <View
          style={
            styles.card
          }>
          <View
            style={
              styles.detailRow
            }>
            <Text
              style={
                styles.detailLabel
              }>
              Items
            </Text>

            <Text
              style={
                styles.detailValue
              }>
              {
                itemCount
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
              styles.detailRow
            }>
            <Text
              style={
                styles.detailLabel
              }>
              Payment
            </Text>

            <Text
              style={
                styles.detailValue
              }>
              {formatPaymentMethod(
                order.payment_method,
              )}
            </Text>
          </View>
        </View>

        <Text
          style={
            styles.sectionTitle
          }>
          Price Summary
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

          {Number(
            order.discount_amount,
          ) > 0 ? (
            <View
              style={
                styles.priceRow
              }>
              <Text
                style={
                  styles.priceLabel
                }>
                Discount
              </Text>

              <Text
                style={
                  styles.priceValue
                }>
                -₹
                {formatMoney(
                  order.discount_amount,
                )}
              </Text>
            </View>
          ) : null}

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
              {pickupDeliveryCharge ===
              0
                ? 'FREE'
                : `₹${formatMoney(
                    pickupDeliveryCharge,
                  )}`}
            </Text>
          </View>

          {gstRate > 0 ||
          gstAmount > 0 ? (
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
                  gstRate
                }
                %
              </Text>

              <Text
                style={
                  styles.priceValue
                }>
                ₹
                {formatMoney(
                  gstAmount,
                )}
              </Text>
            </View>
          ) : null}

          <View
            style={
              styles.priceRow
            }>
            <Text
              style={
                styles.priceLabel
              }>
              Taxable Amount
            </Text>

            <Text
              style={
                styles.priceValue
              }>
              ₹
              {formatMoney(
                taxableAmount,
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
                styles.totalLabel
              }>
              Grand Total
            </Text>

            <Text
              style={
                styles.totalAmount
              }>
              ₹
              {formatMoney(
                order.total_amount,
              )}
            </Text>
          </View>
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
          {(order.order_items ??
            []).map(
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
                    (
                      order.order_items ??
                      []
                    ).length -
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
                      item.item_name
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
                      item.unit_price,
                    )}
                  </Text>

                  {item.customer_notes ? (
                    <Text
                      style={
                        styles.itemNote
                      }>
                      {
                        item.customer_notes
                      }
                    </Text>
                  ) : null}
                </View>

                <Text
                  style={
                    styles.itemAmount
                  }>
                  ₹
                  {formatMoney(
                    item.line_total,
                  )}
                </Text>
              </View>
            ),
          )}
        </View>

        <Text
          style={
            styles.sectionTitle
          }>
          Pickup & Delivery Addresses
        </Text>

        <View
          style={
            styles.card
          }>
          <View>
            <Text
              style={
                styles.addressLabel
              }>
              Pickup address
            </Text>

            <Text
              style={
                styles.addressValue
              }>
              {
                addressText(order.pickup_address_id)
              }
            </Text>
          </View>

          <View
            style={
              styles.divider
            }
          />

          <View>
            <Text
              style={
                styles.addressLabel
              }>
              Delivery address
            </Text>

            <Text
              style={
                styles.addressValue
              }>
              {
                addressText(order.delivery_address_id)
              }
            </Text>
          </View>
        </View>

        <Text
          style={
            styles.sectionTitle
          }>
          Status Timeline
        </Text>

        <View
          style={
            styles.timelineCard
          }>
          {history.length ===
          0 ? (
            <Text
              style={
                styles.emptyTimeline
              }>
              No status history available yet.
            </Text>
          ) : (
            history.map(
              (
                item,
                index,
              ) => {
                const status =
                  getHistoryStatus(
                    item,
                  );

                return (
                  <View
                    key={
                      item.id
                    }
                    style={
                      styles.timelineRow
                    }>
                    <View
                      style={
                        styles.timelineLeft
                      }>
                      <View
                        style={
                          styles.timelineDot
                        }
                      />

                      {index <
                      history.length -
                        1 ? (
                        <View
                          style={
                            styles.timelineLine
                          }
                        />
                      ) : null}
                    </View>

                    <View
                      style={
                        styles.timelineContent
                      }>
                      <Text
                        style={
                          styles.timelineTitle
                        }>
                        {status
                          ? orderStatusLabel(
                              status,
                            )
                          : 'Order Updated'}
                      </Text>

                      <Text
                        style={
                          styles.timelineDate
                        }>
                        {formatDateTime(
                          item.created_at,
                        )}
                      </Text>

                      {item.reason ? (
                        <Text
                          style={
                            styles.timelineReason
                          }>
                          {
                            customerTimelineReason(item.reason)
                          }
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              },
            )
          )}
        </View>
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

    flex: {
      flex: 1,
    },

    header: {
      height: 65,
      paddingHorizontal: 20,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    back: {
      minWidth: 60,
      fontSize: 15,
      fontWeight:
        '600',
    },

    headerTitle: {
      flex: 1,
      textAlign:
        'center',
      fontSize: 18,
      fontWeight:
        '700',
    },

    headerSpacer: {
      width: 60,
    },

    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 35,
    },

    heroCard: {
      borderRadius: 18,
      padding: 18,
      backgroundColor:
        '#111111',
      marginBottom: 20,
    },

    heroTop: {
      flexDirection:
        'row',
      alignItems:
        'flex-start',
      justifyContent:
        'space-between',
      gap: 10,
    },

    orderLabel: {
      fontSize: 9,
      letterSpacing: 0.7,
      color:
        '#AAAAAA',
      fontWeight:
        '700',
    },

    orderNumber: {
      color:
        '#FFFFFF',
      fontSize: 18,
      fontWeight:
        '800',
      marginTop: 4,
    },

    heroDivider: {
      height: 1,
      backgroundColor:
        '#333333',
      marginVertical: 15,
    },

    heroStatusText: {
      color:
        '#FFFFFF',
      fontSize: 14,
      fontWeight:
        '600',
    },

    sectionTitle: {
      fontSize: 16,
      fontWeight:
        '700',
      marginBottom: 9,
      marginTop: 3,
    },

    card: {
      borderWidth: 1,
      borderColor:
        '#E6E6E6',
      borderRadius: 16,
      padding: 16,
      marginBottom: 18,
    },

    detailRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      gap: 15,
    },

    detailLabel: {
      fontSize: 12,
      color:
        '#777777',
      flex: 1,
    },

    detailValue: {
      flex: 1.3,
      fontSize: 13,
      fontWeight:
        '600',
      textAlign:
        'right',
    },

    divider: {
      height: 1,
      backgroundColor:
        '#EEEEEE',
      marginVertical: 13,
    },

    priceCard: {
      backgroundColor:
        '#111111',
      borderRadius: 16,
      padding: 16,
      marginBottom: 18,
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
      fontSize: 12,
      color:
        '#CCCCCC',
    },

    priceValue: {
      fontSize: 13,
      color:
        '#FFFFFF',
      fontWeight:
        '700',
    },

    otpCard: {
      backgroundColor:
        '#F3F0EA',
      borderRadius: 16,
      padding: 16,
      marginBottom: 18,
    },

    otpTitle: {
      fontSize: 16,
      fontWeight:
        '800',
    },

    otpDescription: {
      marginTop: 6,
      color:
        '#555555',
      fontSize: 13,
      lineHeight: 19,
    },

    otpCode: {
      marginTop: 14,
      fontSize: 30,
      fontWeight:
        '800',
      letterSpacing: 5,
    },

    otpExpiry: {
      marginTop: 5,
      color:
        '#555555',
      fontSize: 12,
    },

    otpButton: {
      alignSelf:
        'flex-start',
      backgroundColor:
        '#111111',
      borderRadius: 10,
      marginTop: 14,
      paddingHorizontal: 15,
      paddingVertical: 11,
    },

    otpButtonText: {
      color:
        '#FFFFFF',
      fontSize: 13,
      fontWeight:
        '700',
    },

    otpError: {
      color:
        '#B42318',
      fontSize: 12,
      lineHeight: 18,
      marginTop: 10,
    },

    trackingCard: {
      backgroundColor: '#F3F0EA',
      borderRadius: 16,
      padding: 16,
      marginBottom: 18,
    },

    trackingTitle: {
      fontSize: 16,
      fontWeight: '800',
    },

    trackingText: {
      color: '#555555',
      fontSize: 13,
      lineHeight: 19,
      marginTop: 7,
    },

    trackingError: {
      color: '#B42318',
      fontSize: 13,
      lineHeight: 19,
      marginTop: 8,
    },

    priceDivider: {
      height: 1,
      backgroundColor:
        '#333333',
      marginVertical: 5,
    },

    totalLabel: {
      color:
        '#FFFFFF',
      fontSize: 15,
      fontWeight:
        '800',
    },

    totalAmount: {
      color:
        '#FFFFFF',
      fontSize: 20,
      fontWeight:
        '800',
    },

    itemRow: {
      flexDirection:
        'row',
      alignItems:
        'flex-start',
      paddingVertical: 11,
    },

    itemBorder: {
      borderBottomWidth: 1,
      borderBottomColor:
        '#EEEEEE',
    },

    itemName: {
      fontSize: 14,
      fontWeight:
        '600',
    },

    itemMeta: {
      fontSize: 11,
      color:
        '#777777',
      marginTop: 4,
    },

    itemNote: {
      marginTop: 5,
      fontSize: 11,
      color:
        '#555555',
      lineHeight: 16,
    },

    itemAmount: {
      marginLeft: 12,
      fontSize: 14,
      fontWeight:
        '700',
    },

    addressLabel: {
      fontSize: 10,
      color:
        '#888888',
      marginBottom: 5,
    },

    addressValue: {
      fontSize: 11,
      lineHeight: 16,
      fontWeight:
        '600',
    },

    timelineCard: {
      borderWidth: 1,
      borderColor:
        '#E6E6E6',
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
    },

    timelineRow: {
      flexDirection:
        'row',
      minHeight: 74,
    },

    timelineLeft: {
      width: 24,
      alignItems:
        'center',
    },

    timelineDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor:
        '#111111',
      marginTop: 4,
    },

    timelineLine: {
      width: 2,
      flex: 1,
      backgroundColor:
        '#DDDDDD',
      marginTop: 4,
    },

    timelineContent: {
      flex: 1,
      paddingLeft: 10,
      paddingBottom: 18,
    },

    timelineTitle: {
      fontSize: 13,
      fontWeight:
        '700',
    },

    timelineDate: {
      fontSize: 11,
      color:
        '#777777',
      marginTop: 4,
    },

    timelineReason: {
      fontSize: 11,
      lineHeight: 16,
      color:
        '#555555',
      marginTop: 5,
    },

    emptyTimeline: {
      fontSize: 13,
      color:
        '#666666',
      textAlign:
        'center',
      paddingVertical: 20,
    },

    errorContainer: {
      flex: 1,
      justifyContent:
        'center',
      alignItems:
        'center',
      paddingHorizontal: 30,
    },

    errorTitle: {
      fontSize: 18,
      fontWeight:
        '700',
    },

    errorText: {
      marginTop: 7,
      fontSize: 13,
      lineHeight: 19,
      color:
        '#666666',
      textAlign:
        'center',
    },

    retryButton: {
      marginTop: 18,
      backgroundColor:
        '#111111',
      borderRadius: 10,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },

    retryButtonText: {
      color:
        '#FFFFFF',
      fontSize: 13,
      fontWeight:
        '700',
    },
  });
