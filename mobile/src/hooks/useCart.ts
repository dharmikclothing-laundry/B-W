import {
  useCallback,
  useMemo,
  useState,
} from 'react';

import type {
  CartItem,
  ServiceItem,
} from '../types/service';

type CartState =
  Record<string, number>;

type UseCartOptions = {
  onQuoteItem?: (
    service: ServiceItem,
  ) => void;
};

export function useCart(
  services: ServiceItem[],
  options: UseCartOptions = {},
) {
  const {
    onQuoteItem,
  } = options;

  const [
    cart,
    setCart,
  ] =
    useState<CartState>(
      {},
    );

  const cartItems =
    useMemo<CartItem[]>(
      () => {
        return services
          .filter(
            service =>
              (cart[
                service.id
              ] ?? 0) > 0,
          )
          .map(
            service => ({
              ...service,

              quantity:
                cart[
                  service.id
                ] ?? 0,
            }),
          );
      },
      [
        services,
        cart,
      ],
    );

  const cartItemCount =
    useMemo(
      () => {
        return Object.values(
          cart,
        ).reduce(
          (
            total,
            quantity,
          ) =>
            total +
            quantity,
          0,
        );
      },
      [
        cart,
      ],
    );

  const cartSubtotal =
    useMemo(
      () => {
        return cartItems.reduce(
          (
            total,
            item,
          ) => {
            if (
              item.price ===
              null
            ) {
              return total;
            }

            return (
              total +
              item.price *
                item.quantity
            );
          },
          0,
        );
      },
      [
        cartItems,
      ],
    );

  const getQuantity =
    useCallback(
      (
        serviceId: string,
      ) => {
        return (
          cart[
            serviceId
          ] ?? 0
        );
      },
      [
        cart,
      ],
    );

  const updateQuantity =
    useCallback(
      (
        service: ServiceItem,
        change: number,
      ) => {
        if (
          service.price ===
          null
        ) {
          onQuoteItem?.(
            service,
          );

          return;
        }

        setCart(
          current => {
            const existing =
              current[
                service.id
              ] ?? 0;

            const next =
              existing +
              change;

            if (
              next <= 0
            ) {
              const updated = {
                ...current,
              };

              delete updated[
                service.id
              ];

              return updated;
            }

            return {
              ...current,

              [service.id]:
                Math.min(
                  next,
                  99,
                ),
            };
          },
        );
      },
      [
        onQuoteItem,
      ],
    );

  const resetCart =
    useCallback(
      () => {
        setCart({});
      },
      [],
    );

  return {
    cart,
    cartItems,
    cartItemCount,
    cartSubtotal,

    getQuantity,
    updateQuantity,
    resetCart,
  };
}