import {
  useCallback,
  useState,
} from 'react';

import type {
  PaymentMethod,
} from '../types/payment';

import type {
  SuccessfulOrder,
} from '../types/order';

export function useCheckoutState() {
  const [
    selectedPaymentMethod,
    setSelectedPaymentMethod,
  ] =
    useState<
      PaymentMethod | null
    >(null);

  const [
    termsAccepted,
    setTermsAccepted,
  ] =
    useState(false);

  const [
    placingOrder,
    setPlacingOrder,
  ] =
    useState(false);

  const [
    successfulOrder,
    setSuccessfulOrder,
  ] =
    useState<
      SuccessfulOrder | null
    >(null);

  const resetPaymentState =
    useCallback(
      () => {
        setSelectedPaymentMethod(
          null,
        );

        setTermsAccepted(
          false,
        );

        setPlacingOrder(
          false,
        );
      },
      [],
    );

  const resetOrderSuccess =
    useCallback(
      () => {
        setSuccessfulOrder(
          null,
        );
      },
      [],
    );

  const resetCheckoutState =
    useCallback(
      () => {
        setSelectedPaymentMethod(
          null,
        );

        setTermsAccepted(
          false,
        );

        setPlacingOrder(
          false,
        );

        setSuccessfulOrder(
          null,
        );
      },
      [],
    );

  return {
    selectedPaymentMethod,
    setSelectedPaymentMethod,

    termsAccepted,
    setTermsAccepted,

    placingOrder,
    setPlacingOrder,

    successfulOrder,
    setSuccessfulOrder,

    resetPaymentState,
    resetOrderSuccess,
    resetCheckoutState,
  };
}