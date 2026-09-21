import React, {
  useCallback,
  useMemo,
  useState,
} from 'react';

import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {useFocusEffect} from '@react-navigation/native';
import LoadingView from '../components/LoadingView';
import OrderStatusBadge from '../components/OrderStatusBadge';

import {
  getOrders,
} from '../services/ordersApi';

import {
  CustomerOrder,
  isPastOrder,
} from '../types/order';
import {filterOrderHistory} from '../utils/orderHistory';

type OrdersScreenProps = {
  accessToken: string;
  onBack: () => void;
  onOpenOrder: (
    orderId: string,
  ) => void;
};

type Tab =
  | 'active'
  | 'past';

function formatMoney(
  value: number | string,
) {
  const amount =
    Number(value);

  if (
    Number.isNaN(amount)
  ) {
    return '0';
  }

  return Number.isInteger(
    amount,
  )
    ? amount.toFixed(0)
    : amount.toFixed(2);
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
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    },
  );
}

export default function OrdersScreen({
  accessToken,
  onBack,
  onOpenOrder,
}: OrdersScreenProps) {
  const [
    tab,
    setTab,
  ] =
    useState<Tab>('active');
  const [search, setSearch] = useState('');

  const [
    orders,
    setOrders,
  ] =
    useState<CustomerOrder[]>(
      [],
    );

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
    useState<string | null>(
      null,
    );

  const loadOrders =
    useCallback(
      async (
        isRefresh = false,
      ) => {
        try {
          if (isRefresh) {
            setRefreshing(
              true,
            );
          } else {
            setLoading(
              true,
            );
          }

          setError(null);

          const result =
            await getOrders(
              accessToken,
            );

          setOrders(
            result,
          );
        } catch (
          loadError: any
        ) {
          setError(
            loadError?.message ||
              'Unable to load orders.',
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
      [accessToken],
    );

  useFocusEffect(useCallback(() => {
    loadOrders();
  }, [loadOrders]));

  const activeOrders =
    useMemo(
      () =>
        orders.filter(
          order =>
            !isPastOrder(
              order.current_status,
            ),
        ),
      [orders],
    );

  const pastOrders =
    useMemo(
      () =>
        orders.filter(
          order =>
            isPastOrder(
              order.current_status,
            ),
        ),
      [orders],
    );

  const visibleOrders = filterOrderHistory(tab === 'active' ? activeOrders : pastOrders, search);

  if (loading) {
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
            Your Orders
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <LoadingView
          message="Loading your orders..."
        />
      </SafeAreaView>
    );
  }

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
          Your Orders
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <TextInput accessibilityLabel="Search orders" placeholder="Search order number, status or service" value={search} onChangeText={setSearch} style={styles.searchInput} />

      <View
        style={
          styles.tabs
        }>
        <TouchableOpacity
          style={[
            styles.tab,

            tab === 'active' &&
              styles.tabActive,
          ]}
          onPress={() =>
            setTab(
              'active',
            )
          }>
          <Text
            style={[
              styles.tabText,

              tab === 'active' &&
                styles.tabTextActive,
            ]}>
            Active (
            {
              activeOrders.length
            }
            )
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,

            tab === 'past' &&
              styles.tabActive,
          ]}
          onPress={() =>
            setTab(
              'past',
            )
          }>
          <Text
            style={[
              styles.tabText,

              tab === 'past' &&
                styles.tabTextActive,
            ]}>
            Past (
            {
              pastOrders.length
            }
            )
          </Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View
          style={
            styles.errorCard
          }>
          <Text
            style={
              styles.errorTitle
            }>
            Unable to load orders
          </Text>

          <Text
            style={
              styles.errorText
            }>
            {error}
          </Text>

          <TouchableOpacity
            style={
              styles.retryButton
            }
            onPress={() =>
              loadOrders()
            }>
            <Text
              style={
                styles.retryButtonText
              }>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
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
              loadOrders(
                true,
              )
            }
          />
        }
        showsVerticalScrollIndicator={
          false
        }>
        {visibleOrders.length ===
        0 ? (
          <View
            style={
              styles.emptyCard
            }>
            <Text
              style={
                styles.emptyEmoji
              }>
              📦
            </Text>

            <Text
              style={
                styles.emptyTitle
              }>
              {search.trim() ? 'No matching orders' : tab === 'active' ? 'No active orders' : 'No past orders'}
            </Text>

            <Text
              style={
                styles.emptyText
              }>
              {search.trim() ? 'Try another order number, status or service.' : tab === 'active' ? 'Your current laundry orders will appear here.' : 'Completed and cancelled orders will appear here.'}
            </Text>
          </View>
        ) : (
          visibleOrders.map(
            order => {
              const itemCount =
                (
                  order.order_items ??
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

              return (
                <TouchableOpacity
                  key={
                    order.id
                  }
                  activeOpacity={
                    0.85
                  }
                  style={
                    styles.orderCard
                  }
                  onPress={() =>
                    onOpenOrder(
                      order.id,
                    )
                  }>
                  <View
                    style={
                      styles.orderTopRow
                    }>
                    <View
                      style={
                        styles.flex
                      }>
                      <Text
                        style={
                          styles.orderNumberLabel
                        }>
                        ORDER
                      </Text>

                      <Text
                        style={
                          styles.orderNumber
                        }>
                        {order.order_number ||
                          order.id.slice(
                            0,
                            8,
                          )}
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
                      styles.divider
                    }
                  />

                  <View
                    style={
                      styles.orderInfoRow
                    }>
                    <View
                      style={
                        styles.orderInfoBlock
                      }>
                      <Text
                        style={
                          styles.infoLabel
                        }>
                        Pickup
                      </Text>

                      <Text
                        style={
                          styles.infoValue
                        }>
                        {formatDateTime(
                          order.pickup_scheduled_at,
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.orderInfoBlockRight
                      }>
                      <Text
                        style={
                          styles.infoLabel
                        }>
                        Total
                      </Text>

                      <Text
                        style={
                          styles.amount
                        }>
                        ₹
                        {formatMoney(
                          order.total_amount,
                        )}
                      </Text>
                    </View>
                  </View>

                  {order.pickup_slot_label ? (
                    <Text
                      style={
                        styles.slotText
                      }>
                      {
                        order.pickup_slot_label
                      }
                    </Text>
                  ) : null}

                  <View
                    style={
                      styles.orderFooter
                    }>
                    <Text
                      style={
                        styles.itemCount
                      }>
                      {
                        itemCount
                      }{' '}
                      {itemCount ===
                      1
                        ? 'item'
                        : 'items'}
                    </Text>

                    <Text
                      style={
                        styles.viewDetails
                      }>
                      View Details →
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            },
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    searchInput: {borderWidth: 1, borderColor: '#ddd', borderRadius: 10, marginHorizontal: 20, paddingHorizontal: 12},
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
    },

    back: {
      minWidth: 60,
      fontSize: 15,
      fontWeight: '600',
    },

    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '700',
    },

    headerSpacer: {
      width: 60,
    },

    tabs: {
      marginHorizontal: 20,
      marginBottom: 12,
      padding: 4,
      borderRadius: 12,
      backgroundColor:
        '#F3F3F3',
      flexDirection: 'row',
    },

    tab: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 9,
      alignItems: 'center',
    },

    tabActive: {
      backgroundColor:
        '#111111',
    },

    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#555555',
    },

    tabTextActive: {
      color: '#FFFFFF',
    },

    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 30,
    },

    orderCard: {
      borderWidth: 1,
      borderColor: '#E5E5E5',
      borderRadius: 17,
      padding: 16,
      marginBottom: 13,
      backgroundColor:
        '#FFFFFF',
    },

    orderTopRow: {
      flexDirection: 'row',
      alignItems:
        'flex-start',
      justifyContent:
        'space-between',
      gap: 12,
    },

    orderNumberLabel: {
      fontSize: 9,
      color: '#888888',
      fontWeight: '700',
      letterSpacing: 0.8,
    },

    orderNumber: {
      fontSize: 16,
      fontWeight: '700',
      marginTop: 3,
    },

    divider: {
      height: 1,
      backgroundColor:
        '#EEEEEE',
      marginVertical: 14,
    },

    orderInfoRow: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
    },

    orderInfoBlock: {
      flex: 1,
      paddingRight: 10,
    },

    orderInfoBlockRight: {
      alignItems: 'flex-end',
    },

    infoLabel: {
      fontSize: 10,
      color: '#888888',
      marginBottom: 4,
    },

    infoValue: {
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },

    amount: {
      fontSize: 17,
      fontWeight: '800',
    },

    slotText: {
      fontSize: 12,
      color: '#666666',
      marginTop: 5,
    },

    orderFooter: {
      marginTop: 15,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor:
        '#F1F1F1',
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
    },

    itemCount: {
      fontSize: 12,
      color: '#666666',
    },

    viewDetails: {
      fontSize: 12,
      fontWeight: '700',
    },

    emptyCard: {
      minHeight: 240,
      alignItems: 'center',
      justifyContent:
        'center',
      borderWidth: 1,
      borderColor: '#E5E5E5',
      borderRadius: 18,
      padding: 25,
      marginTop: 10,
    },

    emptyEmoji: {
      fontSize: 40,
      marginBottom: 12,
    },

    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
    },

    emptyText: {
      marginTop: 6,
      fontSize: 13,
      lineHeight: 19,
      color: '#666666',
      textAlign: 'center',
    },

    errorCard: {
      marginHorizontal: 20,
      marginBottom: 12,
      borderRadius: 14,
      padding: 15,
      backgroundColor:
        '#FDECEC',
    },

    errorTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#8A1010',
    },

    errorText: {
      fontSize: 12,
      lineHeight: 18,
      color: '#8A1010',
      marginTop: 4,
    },

    retryButton: {
      alignSelf:
        'flex-start',
      marginTop: 10,
      backgroundColor:
        '#111111',
      borderRadius: 8,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },

    retryButtonText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
  });
