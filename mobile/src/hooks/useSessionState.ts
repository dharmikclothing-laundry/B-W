import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import type {
  AuthSessionResponse,
  SessionStatus,
  StoredSession,
} from '../types/session';

import {
  clearSession,
  hydrateSession,
  persistSession,
  subscribeToSession,
  updateStoredProfile,
} from '../services/sessionManager';

export function useSessionState() {
  const [
    phone,
    setPhone,
  ] =
    useState('');

  const [
    otp,
    setOtp,
  ] =
    useState('');

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    session,
    setSession,
  ] =
    useState<
      StoredSession | null
    >(null);

  const [
    status,
    setStatus,
  ] =
    useState<SessionStatus>(
      'hydrating',
    );

  const [
    profile,
    setProfile,
  ] =
    useState<unknown>(
      null,
    );

  useEffect(
    () => {
      let active =
        true;

      const unsubscribe =
        subscribeToSession(
          next => {
            if (
              !active
            ) {
              return;
            }

            setSession(
              next,
            );

            setProfile(
              next
                ?.profile ??
                null,
            );

            setStatus(
              next
                ? 'authenticated'
                : 'unauthenticated',
            );
          },
        );

      const hydrate =
        async () => {
          try {
            const restored =
              await hydrateSession();

            if (
              !active
            ) {
              return;
            }

            setSession(
              restored,
            );

            setProfile(
              restored
                ?.profile ??
                null,
            );

            setStatus(
              restored
                ? 'authenticated'
                : 'unauthenticated',
            );
          } catch {
            if (
              active
            ) {
              setSession(
                null,
              );

              setProfile(
                null,
              );

              setStatus(
                'unauthenticated',
              );
            }
          }
        };

      hydrate();

      return () => {
        active =
          false;

        unsubscribe();
      };
    },
    [],
  );

  const saveSession =
    useCallback(
      async (
        response:
          AuthSessionResponse,
      ) => {
        const saved =
          await persistSession(
            response,
          );

        setSession(
          saved,
        );

        setProfile(
          saved.profile,
        );

        setStatus(
          'authenticated',
        );

        return saved;
      },
      [],
    );

  const saveProfile =
    useCallback(
      async (
        next: unknown,
      ) => {
        setProfile(
          next,
        );

        await updateStoredProfile(
          next,
        );
      },
      [],
    );

  const resetSession =
    useCallback(
      async () => {
        setPhone(
          '',
        );

        setOtp(
          '',
        );

        setLoading(
          false,
        );

        setProfile(
          null,
        );

        setSession(
          null,
        );

        setStatus(
          'unauthenticated',
        );

        await clearSession();
      },
      [],
    );

  return {
    phone,
    setPhone,

    otp,
    setOtp,

    loading,
    setLoading,

    accessToken:
      session
        ?.accessToken ??
      '',

    refreshToken:
      session
        ?.refreshToken ??
      '',

    session,

    status,

    hydrating:
      status ===
      'hydrating',

    authenticated:
      status ===
      'authenticated',

    saveSession,

    profile,

    setProfile:
      saveProfile,

    resetSession,
  };
}