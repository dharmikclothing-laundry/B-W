import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SupabaseService } from '../../modules/supabase/supabase.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        [
          context.getHandler(),
          context.getClass(),
        ],
      );

    if (isPublic) {
      return true;
    }

    const request =
      context.switchToHttp().getRequest<any>();

    const authorization =
      request.headers?.authorization;

    if (
      !authorization ||
      !authorization.startsWith('Bearer ')
    ) {
      throw new UnauthorizedException(
        'Missing Bearer token',
      );
    }

    const accessToken =
      authorization.slice('Bearer '.length).trim();

    if (!accessToken) {
      throw new UnauthorizedException(
        'Missing Bearer token',
      );
    }

    const user =
      await this.supabase.getUser(accessToken);

    if (!user) {
      throw new UnauthorizedException(
        'Invalid Supabase session',
      );
    }

    /*
     * The token has already been validated.
     *
     * These are backend authorization lookups, so the
     * trusted server client is used deliberately.
     *
     * All returned data remains scoped to the authenticated
     * user's verified UUID.
     */
    const {
      data: profile,
      error: profileError,
    } = await this.supabase.admin
      .from('profiles')
      .select('id,is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      !profile.is_active
    ) {
      throw new UnauthorizedException(
        'Inactive or missing profile',
      );
    }

    const {
      data: rows,
      error: rolesError,
    } = await this.supabase.admin
      .from('profile_roles')
      .select(
        'roles(code,role_permissions(permissions(code)))',
      )
      .eq('profile_id', user.id);

    if (rolesError) {
      throw new UnauthorizedException(
        'Unable to resolve user authorization',
      );
    }

    const roles: string[] = [];
    const permissions: string[] = [];

    for (const row of rows ?? []) {
      const role: any = (row as any).roles;

      if (role?.code) {
        roles.push(role.code);
      }

      for (
        const rolePermission
        of role?.role_permissions ?? []
      ) {
        const permissionCode =
          rolePermission?.permissions?.code;

        if (permissionCode) {
          permissions.push(permissionCode);
        }
      }
    }

    if (roles.includes('admin') && roles.length !== 1) {
      throw new UnauthorizedException('Conflicting account roles');
    }
    if (roles.includes('driver')) {
      const { data: driver, error: driverError } = await this.supabase.admin
        .from('drivers').select('id,is_active').eq('profile_id', user.id).maybeSingle();
      if (driverError || !driver?.is_active) {
        throw new UnauthorizedException('Inactive driver account');
      }
    }
    if (roles.includes('facility_employee') || roles.includes('manager')) {
      const { data: staff, error: staffError } = await this.supabase.admin
        .from('facility_employees').select('id,facility_id,employee_role,is_active')
        .eq('profile_id', user.id).eq('is_active', true).maybeSingle();
      if (staffError || !staff) {
        throw new UnauthorizedException('Inactive facility account');
      }
      if (!roles.includes(staff.employee_role) || roles.length !== 1) {
        throw new UnauthorizedException('Facility role mismatch');
      }
      const { data: facility, error: facilityError } = await this.supabase.admin
        .from('facilities').select('id,is_active').eq('id', staff.facility_id).maybeSingle();
      if (facilityError || !facility?.is_active) {
        throw new UnauthorizedException('Inactive facility');
      }
    }

    request.user = {
      id: user.id,
      phone: user.phone ?? null,
      email: user.email ?? null,
      roles: [...new Set(roles)],
      permissions: [...new Set(permissions)],
    };

    /*
     * Preserve the access token in case a downstream service
     * intentionally needs an RLS-aware user Supabase client.
     */
    request.accessToken = accessToken;

    return true;
  }
}
