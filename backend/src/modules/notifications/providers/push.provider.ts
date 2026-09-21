export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export type PushMessage = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type PushFailureReason =
  | 'unconfigured'
  | 'invalid_token'
  | 'transient'
  | 'provider_error';

export type PushSendResult =
  | {
      ok: true;
      providerMessageId: string;
    }
  | {
      ok: false;
      reason: PushFailureReason;
      errorCode?: string;
    };

export interface PushProvider {
  readonly configured: boolean;
  send(message: PushMessage): Promise<PushSendResult>;
}
