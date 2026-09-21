import {
  useCallback,
  useMemo,
  useState,
} from 'react';

export type PickupDateChoice = {
  key: string;
  dayName: string;
  dateLabel: string;
  fullLabel: string;
};

export type PickupSlot = {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
};

export const PICKUP_SLOTS:
  PickupSlot[] = [
  {
    id: '08-10',
    label:
      '8:00 AM - 10:00 AM',
    startHour: 8,
    endHour: 10,
  },
  {
    id: '10-12',
    label:
      '10:00 AM - 12:00 PM',
    startHour: 10,
    endHour: 12,
  },
  {
    id: '12-14',
    label:
      '12:00 PM - 2:00 PM',
    startHour: 12,
    endHour: 14,
  },
  {
    id: '14-16',
    label:
      '2:00 PM - 4:00 PM',
    startHour: 14,
    endHour: 16,
  },
  {
    id: '16-18',
    label:
      '4:00 PM - 6:00 PM',
    startHour: 16,
    endHour: 18,
  },
  {
    id: '18-20',
    label:
      '6:00 PM - 8:00 PM',
    startHour: 18,
    endHour: 20,
  },
];

function formatDateKey(
  date: Date,
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() +
        1,
    ).padStart(
      2,
      '0',
    );

  const day =
    String(
      date.getDate(),
    ).padStart(
      2,
      '0',
    );

  return `${year}-${month}-${day}`;
}

function buildPickupDate(
  dateKey: string,
  hour: number,
) {
  const [
    year,
    month,
    day,
  ] =
    dateKey
      .split('-')
      .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    hour,
    0,
    0,
    0,
  );
}

export function usePickupSchedule() {
  const [
    selectedPickupDateKey,
    setSelectedPickupDateKey,
  ] =
    useState<
      string | null
    >(null);

  const [
    selectedPickupSlotId,
    setSelectedPickupSlotId,
  ] =
    useState<
      string | null
    >(null);

  const [
    pickupScheduledAt,
    setPickupScheduledAt,
  ] =
    useState('');

  const [
    pickupSlotLabel,
    setPickupSlotLabel,
  ] =
    useState('');

  const pickupDateChoices =
    useMemo<
      PickupDateChoice[]
    >(
      () => {
        const choices:
          PickupDateChoice[] =
            [];

        for (
          let index = 0;
          index < 5;
          index += 1
        ) {
          const date =
            new Date();

          date.setHours(
            0,
            0,
            0,
            0,
          );

          date.setDate(
            date.getDate() +
              index,
          );

          const key =
            formatDateKey(
              date,
            );

          let dayName =
            date.toLocaleDateString(
              'en-IN',
              {
                weekday:
                  'short',
              },
            );

          if (
            index === 0
          ) {
            dayName =
              'Today';
          }

          if (
            index === 1
          ) {
            dayName =
              'Tomorrow';
          }

          const dateLabel =
            date.toLocaleDateString(
              'en-IN',
              {
                day:
                  '2-digit',

                month:
                  'short',
              },
            );

          const fullLabel =
            date.toLocaleDateString(
              'en-IN',
              {
                weekday:
                  'long',

                day:
                  'numeric',

                month:
                  'long',

                year:
                  'numeric',
              },
            );

          choices.push({
            key,
            dayName,
            dateLabel,
            fullLabel,
          });
        }

        return choices;
      },
      [],
    );

  const selectedPickupDate =
    useMemo(
      () => {
        if (
          !selectedPickupDateKey
        ) {
          return null;
        }

        return (
          pickupDateChoices.find(
            item =>
              item.key ===
              selectedPickupDateKey,
          ) ?? null
        );
      },
      [
        pickupDateChoices,
        selectedPickupDateKey,
      ],
    );

  const isSlotUnavailable =
    useCallback(
      (
        dateKey: string,
        slot: PickupSlot,
      ) => {
        const slotStart =
          buildPickupDate(
            dateKey,
            slot.startHour,
          );

        return (
          slotStart.getTime() <=
          Date.now()
        );
      },
      [],
    );

  const ensureInitialPickupDate =
    useCallback(
      () => {
        if (
          selectedPickupDateKey
        ) {
          return;
        }

        const firstDate =
          pickupDateChoices[0];

        if (
          firstDate
        ) {
          setSelectedPickupDateKey(
            firstDate.key,
          );
        }
      },
      [
        pickupDateChoices,
        selectedPickupDateKey,
      ],
    );

  const choosePickupDate =
    useCallback(
      (
        dateKey: string,
      ) => {
        setSelectedPickupDateKey(
          dateKey,
        );

        setSelectedPickupSlotId(
          null,
        );

        setPickupScheduledAt(
          '',
        );

        setPickupSlotLabel(
          '',
        );
      },
      [],
    );

  const choosePickupSlot =
    useCallback(
      (
        slot: PickupSlot,
      ) => {
        if (
          !selectedPickupDateKey
        ) {
          return {
            ok: false,
            reason:
              'date_required' as const,
          };
        }

        if (
          isSlotUnavailable(
            selectedPickupDateKey,
            slot,
          )
        ) {
          return {
            ok: false,
            reason:
              'unavailable' as const,
          };
        }

        const pickupDate =
          buildPickupDate(
            selectedPickupDateKey,
            slot.startHour,
          );

        setSelectedPickupSlotId(
          slot.id,
        );

        setPickupScheduledAt(
          pickupDate.toISOString(),
        );

        setPickupSlotLabel(
          slot.label,
        );

        return {
          ok: true,
          reason:
            null,
        };
      },
      [
        selectedPickupDateKey,
        isSlotUnavailable,
      ],
    );

  const resetPickupSchedule =
    useCallback(
      () => {
        setSelectedPickupDateKey(
          null,
        );

        setSelectedPickupSlotId(
          null,
        );

        setPickupScheduledAt(
          '',
        );

        setPickupSlotLabel(
          '',
        );
      },
      [],
    );

  return {
    pickupDateChoices,
    pickupSlots:
      PICKUP_SLOTS,

    selectedPickupDateKey,
    selectedPickupSlotId,
    selectedPickupDate,

    pickupScheduledAt,
    pickupSlotLabel,

    ensureInitialPickupDate,
    choosePickupDate,
    choosePickupSlot,
    isSlotUnavailable,

    resetPickupSchedule,
  };
}