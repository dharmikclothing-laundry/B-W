import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuthService {
  constructor(private readonly s: SupabaseService) {}

  async requestOtp(phone: string) {
    const { error } = await this.s.createAuthClient().auth.signInWithOtp({
      phone, options: { shouldCreateUser: true },
    });
    if (error) throw new BadRequestException(error.message);
    return { sent: true };
  }

  async verifyOtp(phone: string, token: string) {
    // OTP verification stores a session in memory, so never share this client.
    const { data, error } = await this.s.createAuthClient().auth.verifyOtp({ phone, token, type: 'sms' });
    if (error || !data.session || !data.user) {
      throw new UnauthorizedException(error?.message || 'Invalid OTP');
    }
    const profile = await this.ensureProfile(data.user.id, data.user.phone);
    return { session: data.session, user: { id: data.user.id, phone: data.user.phone }, profile };
  }

  async refresh(refreshToken: string) {
    // Refreshing rotates session credentials, so isolate the auth state per request.
    const { data, error } = await this.s.createAuthClient().auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session || !data.user) {
      // Provider errors may contain credential-related context. Keep the public
      // response stable and never include the submitted refresh token.
      throw new UnauthorizedException('Invalid or expired refresh session');
    }

    const profile = await this.ensureProfile(data.user.id, data.user.phone);
    return {
      session: data.session,
      user: { id: data.user.id, phone: data.user.phone },
      profile,
    };
  }

  async ensureProfile(id: string, phone?: string) {
    // Trusted provisioning is scoped exclusively to the verified Auth user.
    const db = this.s.admin;
    const { error: insertError } = await db.from('profiles').upsert(
      { id, phone: phone || null }, { onConflict: 'id', ignoreDuplicates: true },
    );
    if (insertError) throw new BadRequestException(insertError.message);
    const { data: profile, error } = await db.from('profiles').select('*').eq('id', id).single();
    if (error) throw new BadRequestException(error.message);
    if (!profile?.is_active) throw new UnauthorizedException('Inactive or missing profile');

    const { data: assignments, error: lookupError } = await db.from('profile_roles')
      .select('roles(code)').eq('profile_id', id);
    if (lookupError) throw new UnauthorizedException('Unable to resolve account role');
    const codes = (assignments ?? []).map((row: any) => row.roles?.code).filter(Boolean);
    const privileged = codes.filter((code: string) =>
      ['driver', 'facility_employee', 'manager', 'admin'].includes(code));
    if (privileged.length) {
      if (codes.length !== 1) throw new UnauthorizedException('Conflicting account roles');
      const role = privileged[0];
      if (role === 'driver') {
        const { data: driver, error: driverError } = await db.from('drivers')
          .select('id,is_active').eq('profile_id', id).maybeSingle();
        if (driverError || !driver?.is_active) throw new UnauthorizedException('Inactive driver account');
      } else if (role === 'manager' || role === 'facility_employee') {
        const { data: staff, error: staffError } = await db.from('facility_employees')
          .select('id,facility_id,employee_role,is_active').eq('profile_id', id).eq('is_active', true).maybeSingle();
        if (staffError || !staff) throw new UnauthorizedException('Inactive facility account');
        if (staff.employee_role !== role) throw new UnauthorizedException('Facility role mismatch');
        const { data: facility, error: facilityError } = await db.from('facilities')
          .select('id,is_active').eq('id', staff.facility_id).maybeSingle();
        if (facilityError || !facility?.is_active) throw new UnauthorizedException('Inactive facility');
      }
      return { ...profile, accountRole: role };
    }

    // The profile trigger does not create these records. Repair partial provisioning
    // on every verified login without overwriting existing customer data or roles.
    const { data: role, error: roleError } = await db.from('roles').select('id').eq('code', 'customer').single();
    if (roleError || !role) throw new BadRequestException('Customer role unavailable');
    const { error: assignmentError } = await db.from('profile_roles').upsert(
      { profile_id: id, role_id: role.id }, { onConflict: 'profile_id,role_id', ignoreDuplicates: true },
    );
    if (assignmentError) throw new BadRequestException(assignmentError.message);
    const { error: customerError } = await db.from('customers').upsert(
      { profile_id: id, referral_code: `BW${id.replace(/-/g, '').toUpperCase()}` },
      { onConflict: 'profile_id', ignoreDuplicates: true },
    );
    if (customerError) throw new BadRequestException(customerError.message);
    return { ...profile, accountRole: 'customer' };
  }

  async me(userId: string) {
    // userId comes from the global guard's verified JWT, never a request body.
    const { data: profile, error } = await this.s.admin.from('profiles').select('*').eq('id', userId).single();
    if (error) throw new BadRequestException(error.message);
    const { data: roles, error: rolesError } = await this.s.admin.from('profile_roles')
      .select('roles(code,name,role_permissions(permissions(code,name)))').eq('profile_id', userId);
    if (rolesError) throw new BadRequestException(rolesError.message);
    return { profile, roles: roles || [] };
  }
}
