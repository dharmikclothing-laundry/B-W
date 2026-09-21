import {BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException} from '@nestjs/common';
import {SupabaseService} from '../supabase/supabase.service';

/** Scope legacy QR HTTP routes without changing their customer/Driver response contracts. */
@Injectable()
export class QrAccessGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<any>();
    const user = request.user;
    let orderId = request.params?.orderId;
    if (request.method === 'POST') {
      if (request.body?.action !== 'lookup') throw new BadRequestException('QR lookup action required');
      const code = request.body?.token;
      if (typeof code !== 'string' || !/^(?:BW1:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code.trim())) {
        throw new BadRequestException('Valid QR code required');
      }
      const token = code.trim().replace(/^BW1:/, '');
      const {data: qr, error} = await this.supabase.admin.from('order_qr_codes')
        .select('order_id,is_active').eq('secure_token', token).maybeSingle();
      if (error || !qr?.is_active) throw new NotFoundException('Invalid QR code');
      orderId = qr.order_id;
      request.body.token = token;
    }
    const {data: order, error} = await this.supabase.admin.from('orders')
      .select('id,facility_id,customers(profile_id)').eq('id', orderId).maybeSingle();
    if (error || !order) throw new NotFoundException('Order not found');
    if (user.roles?.includes('admin')) return true;
    if (request.method === 'GET' && (order as any).customers?.profile_id === user.id) return true;
    if (user.roles?.includes('manager') || user.roles?.includes('facility_employee')) {
      const {data: staff} = await this.supabase.admin.from('facility_employees')
        .select('facility_id').eq('profile_id', user.id).eq('is_active', true).maybeSingle();
      if (staff && staff.facility_id === order.facility_id) return true;
    }
    if (user.roles?.includes('driver')) {
      const {data: driver} = await this.supabase.admin.from('drivers')
        .select('id,is_active').eq('profile_id', user.id).maybeSingle();
      if (driver?.is_active) {
        const {data: assignment} = await this.supabase.admin.from('driver_assignments')
          .select('id').eq('order_id', orderId).eq('driver_id', driver.id)
          .in('status', ['assigned', 'accepted', 'en_route', 'arrived']).limit(1).maybeSingle();
        if (assignment) return true;
      }
    }
    throw new ForbiddenException('QR belongs to another account or facility');
  }
}
