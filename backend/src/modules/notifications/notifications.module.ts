import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { NotificationDispatchController } from './notification-dispatch.controller';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FcmProvider } from './providers/fcm.provider';
import { PUSH_PROVIDER } from './providers/push.provider';

@Module({
  imports: [SupabaseModule],
  providers: [
    NotificationsService,
    NotificationDispatcher,
    {
      provide: PUSH_PROVIDER,
      useClass: FcmProvider,
    },
  ],
  controllers: [NotificationsController, NotificationDispatchController],
  exports: [NotificationsService, NotificationDispatcher],
})
export class NotificationsModule {}
