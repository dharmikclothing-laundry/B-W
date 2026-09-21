import { Module } from "@nestjs/common";

import { getProviderConfiguration } from "../../config/provider-config";
import { SupabaseModule } from "../supabase/supabase.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { MockPaymentProvider } from "./providers/mock-payment.provider";
import { PAYMENT_PROVIDER } from "./providers/payment.provider";
import { RazorpayPaymentProvider } from "./providers/razorpay-payment.provider";

@Module({
  imports: [SupabaseModule, LogisticsModule],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      useFactory: () => {
        const configuration = getProviderConfiguration();

        return configuration.payments.mode === "mock"
          ? new MockPaymentProvider()
          : new RazorpayPaymentProvider(
              configuration.payments.keyId!,
              configuration.payments.keySecret!,
            );
      },
    },
    PaymentsService,
  ],
  controllers: [PaymentsController],
  exports: [PaymentsService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
