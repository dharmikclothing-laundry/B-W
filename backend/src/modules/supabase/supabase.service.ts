import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  SupabaseClient,
  User,
} from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  public readonly client: SupabaseClient;
  public readonly admin: SupabaseClient;

  private readonly url: string;
  private readonly anonKey: string;

  constructor(private readonly config: ConfigService) {
    this.url =
      this.config.getOrThrow<string>('SUPABASE_URL');

    this.anonKey =
      this.config.get<string>('SUPABASE_PUBLISHABLE_KEY') ??
      this.config.getOrThrow<string>('SUPABASE_ANON_KEY');

    const serviceRoleKey =
      this.config.get<string>('SUPABASE_SECRET_KEY') ??
      this.config.getOrThrow<string>(
        'SUPABASE_SERVICE_ROLE_KEY',
      );

    this.client = createClient(
      this.url,
      this.anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    this.admin = createClient(
      this.url,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  createAuthClient(): SupabaseClient {
    return createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async getUser(accessToken: string): Promise<User | null> {
    if (!accessToken) {
      return null;
    }

    const {
      data,
      error,
    } = await this.client.auth.getUser(accessToken);

    if (error || !data.user) {
      return null;
    }

    return data.user;
  }

  createUserClient(
    accessToken: string,
  ): SupabaseClient {
    return createClient(
      this.url,
      this.anonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }
}
