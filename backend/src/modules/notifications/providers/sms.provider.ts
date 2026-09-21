export interface SmsProvider { send(to: string, body: string): Promise<{ providerMessageId?: string }>; }
export class SmsProviderAdapter implements SmsProvider {
  async send(_to:string, _body:string){ if(!process.env.SMS_PROVIDER) throw new Error('SMS provider not configured'); return {}; }
}
