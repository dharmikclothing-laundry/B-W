import React from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type ServiceItem = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  description: string | null;
  pricingUnit: string;
  price: number | null;
  facilityId: string | null;
};

type CategoryScreenProps = {
  categoryName: string;
  services: ServiceItem[];
  cartItemCount: number;
  cartSubtotal: number;
  getQuantity: (serviceId: string) => number;
  onBack: () => void;
  onOpenCart: () => void;
  onUpdateQuantity: (
    service: ServiceItem,
    change: number,
  ) => void;
};

function formatMoney(
  value: number,
) {
  return Number.isInteger(value)
    ? value.toFixed(0)
    : value.toFixed(2);
}

function categoryEmoji(
  name: string,
) {
  switch (name) {
    case 'Wash & Fold':
      return '🧺';

    case 'Wash & Steam Iron':
      return '♨️';

    case 'Premium Laundry':
      return '✨';

    case 'Wash & Iron':
      return '👔';

    case 'Steam Ironing':
      return '🔥';

    case 'Dry Cleaning':
      return '🧥';

    case 'Household & Linen Care':
      return '🛏️';

    case 'Shoe Cleaning':
      return '👟';

    case 'Add-On Services':
      return '➕';

    default:
      return '🧼';
  }
}

function categoryDescription(
  name: string,
) {
  switch (name) {
    case 'Wash & Fold':
      return 'Everyday laundry by weight';

    case 'Wash & Steam Iron':
      return 'Clean, steam ironed and ready';

    case 'Premium Laundry':
      return 'Premium garment care';

    case 'Wash & Iron':
      return 'Wash and professional ironing';

    case 'Steam Ironing':
      return 'Crisp professional finishing';

    case 'Dry Cleaning':
      return 'Special care for premium garments';

    case 'Household & Linen Care':
      return 'Bedsheets, curtains, blankets & more';

    case 'Shoe Cleaning':
      return 'Professional shoe care';

    case 'Add-On Services':
      return 'Extra care and finishing options';

    default:
      return 'Professional laundry care';
  }
}

export default function CategoryScreen({
  categoryName,
  services,
  cartItemCount,
  cartSubtotal,
  getQuantity,
  onBack,
  onOpenCart,
  onUpdateQuantity,
}: CategoryScreenProps) {
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

          <Text
            style={styles.pageHeaderTitle}
            numberOfLines={1}>
            {categoryName}
          </Text>

          <TouchableOpacity
            style={styles.headerCartButton}
            onPress={onOpenCart}>
            <Text style={styles.headerCartText}>
              Cart
            </Text>

            {cartItemCount > 0 ? (
              <View style={styles.headerCartBadge}>
                <Text style={styles.headerCartBadgeText}>
                  {cartItemCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={
            cartItemCount > 0
              ? styles.itemsScrollWithCart
              : styles.itemsScroll
          }>
          <View style={styles.categoryHero}>
            <Text style={styles.categoryHeroEmoji}>
              {categoryEmoji(categoryName)}
            </Text>

            <View style={styles.categoryHeroInfo}>
              <Text style={styles.categoryHeroTitle}>
                {categoryName}
              </Text>

              <Text style={styles.categoryHeroDescription}>
                {categoryDescription(categoryName)}
              </Text>

              <Text style={styles.categoryHeroCount}>
                {services.length} services
              </Text>
            </View>
          </View>

          {services.map(service => {
            const quantity =
              getQuantity(service.id);

            const isQuote =
              service.price === null;

            return (
              <View
                key={service.id}
                style={styles.itemCard}>
                <View style={styles.itemTopRow}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>
                      {service.name}
                    </Text>

                    {service.description ? (
                      <Text style={styles.itemDescription}>
                        {service.description}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.itemPriceContainer}>
                    {isQuote ? (
                      <>
                        <Text style={styles.quotePrice}>
                          Quote
                        </Text>

                        <Text style={styles.itemPriceUnit}>
                          after inspection
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.itemPrice}>
                          ₹
                          {formatMoney(
                            service.price ?? 0,
                          )}
                        </Text>

                        <Text style={styles.itemPriceUnit}>
                          per {service.pricingUnit}
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                {isQuote ? (
                  <TouchableOpacity
                    style={styles.quoteButton}
                    onPress={() =>
                      Alert.alert(
                        service.name,
                        'This item requires inspection before pricing.',
                      )
                    }>
                    <Text style={styles.quoteButtonText}>
                      Price after inspection
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.itemQuantityArea}>
                    <Text style={styles.quantityLabel}>
                      Quantity
                    </Text>

                    <View style={styles.quantityControl}>
                      <TouchableOpacity
                        style={[
                          styles.quantityButton,
                          quantity === 0 &&
                            styles.quantityButtonDisabled,
                        ]}
                        disabled={quantity === 0}
                        onPress={() =>
                          onUpdateQuantity(
                            service,
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

                      <Text style={styles.quantityValue}>
                        {quantity}
                      </Text>

                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() =>
                          onUpdateQuantity(
                            service,
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
                )}
              </View>
            );
          })}
        </ScrollView>

        {cartItemCount > 0 ? (
          <TouchableOpacity
            style={styles.cartBottomBar}
            onPress={onOpenCart}>
            <View>
              <Text style={styles.cartBottomCount}>
                {cartItemCount}{' '}
                {cartItemCount === 1
                  ? 'item'
                  : 'items'}
              </Text>

              <Text style={styles.cartBottomTotal}>
                ₹{formatMoney(cartSubtotal)}
              </Text>
            </View>

            <Text style={styles.cartBottomAction}>
              View Cart →
            </Text>
          </TouchableOpacity>
        ) : null}
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

  headerCartButton: {
    minWidth: 60,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },

  headerCartText: {
    fontSize: 15,
    fontWeight: '600',
  },

  headerCartBadge: {
    marginLeft: 5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerCartBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  itemsScroll: {
    paddingBottom: 30,
  },

  itemsScrollWithCart: {
    paddingBottom: 115,
  },

  categoryHero: {
    backgroundColor: '#F7F7F7',
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },

  categoryHeroEmoji: {
    fontSize: 40,
    marginRight: 16,
  },

  categoryHeroInfo: {
    flex: 1,
  },

  categoryHeroTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },

  categoryHeroDescription: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 18,
  },

  categoryHeroCount: {
    fontSize: 12,
    color: '#888888',
    marginTop: 7,
  },

  itemCard: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 16,
    padding: 17,
    marginBottom: 12,
  },

  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  itemInfo: {
    flex: 1,
    paddingRight: 14,
  },

  itemName: {
    fontSize: 16,
    fontWeight: '600',
  },

  itemDescription: {
    marginTop: 5,
    fontSize: 13,
    color: '#777777',
  },

  itemPriceContainer: {
    alignItems: 'flex-end',
  },

  itemPrice: {
    fontSize: 18,
    fontWeight: '700',
  },

  quotePrice: {
    fontSize: 15,
    fontWeight: '700',
  },

  itemPriceUnit: {
    fontSize: 11,
    color: '#777777',
  },

  itemQuantityArea: {
    marginTop: 15,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  quantityLabel: {
    fontSize: 13,
    color: '#666666',
  },

  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  quantityButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D7D7D7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  quantityButtonDisabled: {
    opacity: 0.35,
  },

  quantityButtonText: {
    fontSize: 20,
  },

  quantityValue: {
    minWidth: 36,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },

  quoteButton: {
    marginTop: 14,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#F4F4F4',
    alignItems: 'center',
  },

  quoteButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },

  cartBottomBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 10,
    minHeight: 72,
    backgroundColor: '#111111',
    borderRadius: 17,
    paddingHorizontal: 20,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  cartBottomCount: {
    color: '#BBBBBB',
    fontSize: 12,
  },

  cartBottomTotal: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  cartBottomAction: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});