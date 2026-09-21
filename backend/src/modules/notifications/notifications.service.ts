import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly supabase: SupabaseService) {}

  private db() {
    return this.supabase.admin;
  }

  async registerDevice(
    profileId: string,
    token: string,
    platform: 'ios' | 'android',
  ) {
    const { data, error } = await this.db()
      .from('device_tokens')
      .upsert(
        {
          profile_id: profileId,
          push_token: token,
          platform,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'push_token' },
      )
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async deactivateDevice(profileId: string, token: string) {
    const { data, error } = await this.db()
      .from('device_tokens')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('profile_id', profileId)
      .eq('push_token', token)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new BadRequestException('Unable to deactivate notification device');
    }

    return {
      deactivated: Boolean(data),
    };
  }

  async create(
    profileId: string,
    type: string,
    title: string,
    body: string,
    data?: any,
  ) {
    const { data: row, error } = await this.db()
      .from('notifications')
      .insert({
        profile_id: profileId,
        notification_type: type,
        title,
        body,
        data: data || {},
        status: 'queued',
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return row;
  }

  async list(profileId: string) {
    const { data, error } = await this.db()
      .from('notifications')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async markRead(profileId: string, id: string) {
    const { data, error } = await this.db()
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('profile_id', profileId)
      .select()
      .maybeSingle();

    if (error) {
      throw new BadRequestException('Unable to mark notification read');
    }

    if (!data) {
      throw new NotFoundException('Notification not found');
    }

    return data;
  }
}
