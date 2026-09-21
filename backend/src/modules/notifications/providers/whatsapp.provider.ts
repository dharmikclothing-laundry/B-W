export interface WhatsAppProvider { sendTemplate(to:string, template:string, variables:Record<string,string>):Promise<{providerMessageId?:string}>; }
export class WhatsAppProviderAdapter implements WhatsAppProvider {
  async sendTemplate(_to:string, _template:string, _variables:Record<string,string>){
    if(!process.env.WHATSAPP_PROVIDER) throw new Error('WhatsApp provider not configured');
    return {};
  }
}
