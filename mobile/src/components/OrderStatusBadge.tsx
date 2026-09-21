import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  orderStatusLabel,
} from '../types/order';

type OrderStatusBadgeProps = {
  status: string;
};

function getStatusStyle(
  status: string,
) {
  switch (status) {
    case 'pending_payment':
      return styles.warning;

    case 'confirmed':
    case 'pickup_assigned':
    case 'pickup_accepted':
      return styles.info;

    case 'picked_up':
    case 'received_at_facility':
    case 'processing':
    case 'ready_for_delivery':
      return styles.progress;

    case 'delivery_assigned':
    case 'out_for_delivery':
      return styles.delivery;

    case 'delivered':
    case 'claim_period_active':
      return styles.delivered;

    case 'completed':
      return styles.completed;

    case 'cancelled':
      return styles.cancelled;

    case 'draft':
    default:
      return styles.neutral;
  }
}

function getTextStyle(
  status: string,
) {
  switch (status) {
    case 'cancelled':
      return styles.cancelledText;

    case 'completed':
      return styles.completedText;

    default:
      return styles.defaultText;
  }
}

export default function OrderStatusBadge({
  status,
}: OrderStatusBadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        getStatusStyle(
          status,
        ),
      ]}>
      <Text
        style={[
          styles.text,
          getTextStyle(
            status,
          ),
        ]}>
        {orderStatusLabel(
          status,
        )}
      </Text>
    </View>
  );
}

const styles =
  StyleSheet.create({
    badge: {
      alignSelf:
        'flex-start',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },

    text: {
      fontSize: 11,
      fontWeight: '700',
    },

    defaultText: {
      color: '#111111',
    },

    neutral: {
      backgroundColor:
        '#EEEEEE',
    },

    warning: {
      backgroundColor:
        '#FFF4D6',
    },

    info: {
      backgroundColor:
        '#E8F1FF',
    },

    progress: {
      backgroundColor:
        '#EAF7F0',
    },

    delivery: {
      backgroundColor:
        '#F0ECFF',
    },

    delivered: {
      backgroundColor:
        '#E7F7F4',
    },

    completed: {
      backgroundColor:
        '#111111',
    },

    completedText: {
      color: '#FFFFFF',
    },

    cancelled: {
      backgroundColor:
        '#FDECEC',
    },

    cancelledText: {
      color: '#A11212',
    },
  });