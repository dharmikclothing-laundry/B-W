import { NotificationDispatcher } from './notification-dispatcher.service';

type DatabaseResponse = {
  data?: unknown;
  error?: unknown;
};

type ExpectedQuery = {
  table: string;
  response: DatabaseResponse;
};

function databaseFixture(expectedQueries: ExpectedQuery[]) {
  const calls: Array<{
    table: string;
    methods: Array<{ name: string; arguments: unknown[] }>;
  }> = [];

  const db = {
    from: jest.fn((table: string) => {
      const expected = expectedQueries.shift();
      if (!expected || expected.table !== table) {
        throw new Error(
          `Unexpected database query for ${table}; expected ${expected?.table ?? 'none'}`,
        );
      }

      const call = { table, methods: [] as Array<{ name: string; arguments: unknown[] }> };
      calls.push(call);
      const builder: any = {};

      for (const name of [
        'select',
        'eq',
        'update',
        'insert',
        'in',
        'order',
        'limit',
      ]) {
        builder[name] = jest.fn((...args: unknown[]) => {
          call.methods.push({ name, arguments: args });
          return builder;
        });
      }

      builder.maybeSingle = jest.fn(async () => expected.response);
      builder.single = jest.fn(async () => expected.response);
      builder.then = (
        resolve: (result: DatabaseResponse) => unknown,
        reject: (error: unknown) => unknown,
      ) => Promise.resolve(expected.response).then(resolve, reject);

      return builder;
    }),
  };

  return { db, calls, remaining: expectedQueries };
}

const notification = {
  id: 'notification-id',
  profile_id: 'profile-id',
  notification_type: 'order_status',
  title: 'Order update',
  body: 'Your order is ready.',
  data: { orderId: 'order-id', attempt: 2 },
  status: 'queued',
};

function serviceFixture(
  expectedQueries: ExpectedQuery[],
  send: jest.Mock = jest.fn().mockResolvedValue({
    ok: true,
    providerMessageId: 'provider-message-id',
  }),
  configured = true,
) {
  const database = databaseFixture(expectedQueries);
  const provider = { configured, send };
  const service = new NotificationDispatcher(
    { admin: database.db } as any,
    provider,
  );
  return { service, send, provider, ...database };
}

describe('NotificationDispatcher', () => {
  it('dispatches a persisted notification, records a sanitized attempt, and deactivates invalid tokens', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        providerMessageId: 'provider-message-id',
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: 'invalid_token',
        errorCode: 'messaging/registration-token-not-registered',
      });
    const f = serviceFixture(
      [
        { table: 'notifications', response: { data: notification, error: null } },
        {
          table: 'notifications',
          response: { data: { ...notification, status: 'processing' }, error: null },
        },
        {
          table: 'notification_preferences',
          response: { data: { push_enabled: true }, error: null },
        },
        {
          table: 'device_tokens',
          response: {
            data: [
              { id: 'device-a', push_token: 'SECRET_PUSH_TOKEN_A' },
              { id: 'device-b', push_token: 'SECRET_PUSH_TOKEN_B' },
            ],
            error: null,
          },
        },
        { table: 'device_tokens', response: { data: null, error: null } },
        {
          table: 'notification_delivery_attempts',
          response: { data: { attempt_number: 2 }, error: null },
        },
        {
          table: 'notification_delivery_attempts',
          response: { data: null, error: null },
        },
        { table: 'notifications', response: { data: null, error: null } },
      ],
      send,
    );

    await expect(f.service.dispatchPersisted(notification.id)).resolves.toEqual({
      notificationId: notification.id,
      dispatched: true,
      status: 'sent',
      attemptedDeviceCount: 2,
      sentCount: 1,
      failedCount: 1,
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, {
      token: 'SECRET_PUSH_TOKEN_A',
      title: notification.title,
      body: notification.body,
      data: {
        notificationId: notification.id,
        notificationType: notification.notification_type,
        orderId: 'order-id',
        attempt: '2',
      },
    });

    const deactivateCall = f.calls[4];
    expect(deactivateCall.methods).toContainEqual({
      name: 'in',
      arguments: ['id', ['device-b']],
    });

    const attemptInsert = f.calls[6].methods.find(
      (method) => method.name === 'insert',
    )?.arguments[0] as Record<string, unknown>;
    expect(attemptInsert).toMatchObject({
      notification_id: notification.id,
      attempt_number: 3,
      status: 'sent',
    });
    expect(JSON.stringify(attemptInsert)).not.toContain('SECRET_PUSH_TOKEN_A');
    expect(JSON.stringify(attemptInsert)).not.toContain('SECRET_PUSH_TOKEN_B');
    expect(f.remaining).toEqual([]);
  });

  it('records a failed attempt when no active devices exist', async () => {
    const f = serviceFixture([
      { table: 'notifications', response: { data: notification, error: null } },
      {
        table: 'notifications',
        response: { data: { ...notification, status: 'processing' }, error: null },
      },
      {
        table: 'notification_preferences',
        response: { data: { push_enabled: true }, error: null },
      },
      { table: 'device_tokens', response: { data: [], error: null } },
      {
        table: 'notification_delivery_attempts',
        response: { data: null, error: null },
      },
      {
        table: 'notification_delivery_attempts',
        response: { data: null, error: null },
      },
      { table: 'notifications', response: { data: null, error: null } },
    ]);

    await expect(f.service.dispatchPersisted(notification.id)).resolves.toEqual({
      notificationId: notification.id,
      dispatched: true,
      status: 'failed',
      attemptedDeviceCount: 0,
      sentCount: 0,
      failedCount: 0,
      reason: 'no_active_devices',
    });
    expect(f.send).not.toHaveBeenCalled();
  });

  it('honors disabled push preferences without contacting Firebase', async () => {
    const f = serviceFixture([
      { table: 'notifications', response: { data: notification, error: null } },
      {
        table: 'notifications',
        response: { data: { ...notification, status: 'processing' }, error: null },
      },
      {
        table: 'notification_preferences',
        response: { data: { push_enabled: false }, error: null },
      },
      {
        table: 'notification_delivery_attempts',
        response: { data: null, error: null },
      },
      {
        table: 'notification_delivery_attempts',
        response: { data: null, error: null },
      },
      { table: 'notifications', response: { data: null, error: null } },
    ]);

    await expect(f.service.dispatchPersisted(notification.id)).resolves.toEqual({
      notificationId: notification.id,
      dispatched: true,
      status: 'cancelled',
      attemptedDeviceCount: 0,
      sentCount: 0,
      failedCount: 0,
      reason: 'push_disabled',
    });
    expect(f.send).not.toHaveBeenCalled();
  });

  it('does not redeliver a notification that has already been sent', async () => {
    const f = serviceFixture([
      {
        table: 'notifications',
        response: { data: { ...notification, status: 'sent' }, error: null },
      },
    ]);

    await expect(f.service.dispatchPersisted(notification.id)).resolves.toEqual({
      notificationId: notification.id,
      dispatched: false,
      status: 'sent',
      attemptedDeviceCount: 0,
      sentCount: 0,
      failedCount: 0,
      reason: 'not_dispatchable',
    });
    expect(f.send).not.toHaveBeenCalled();
  });

  it('records unexpected provider failures without exposing thrown details', async () => {
    const send = jest.fn().mockRejectedValue(
      new Error('provider message containing device token or credentials'),
    );
    const f = serviceFixture(
      [
        { table: 'notifications', response: { data: notification, error: null } },
        {
          table: 'notifications',
          response: { data: { ...notification, status: 'processing' }, error: null },
        },
        {
          table: 'notification_preferences',
          response: { data: { push_enabled: true }, error: null },
        },
        {
          table: 'device_tokens',
          response: {
            data: [{ id: 'device-a', push_token: 'SECRET_PUSH_TOKEN_A' }],
            error: null,
          },
        },
        {
          table: 'notification_delivery_attempts',
          response: { data: null, error: null },
        },
        {
          table: 'notification_delivery_attempts',
          response: { data: null, error: null },
        },
        { table: 'notifications', response: { data: null, error: null } },
      ],
      send,
    );

    await expect(f.service.dispatchPersisted(notification.id)).resolves.toMatchObject({
      status: 'failed',
      failedCount: 1,
    });
    const attemptInsert = f.calls[5].methods.find(
      (method) => method.name === 'insert',
    )?.arguments[0];
    expect(JSON.stringify(attemptInsert)).not.toContain('provider message');
    expect(JSON.stringify(attemptInsert)).not.toContain('SECRET_PUSH_TOKEN_A');
  });
});
