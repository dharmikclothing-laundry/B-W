import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'crypto';

import { SupabaseService } from '../supabase/supabase.service';
import { LogisticsService } from '../logistics/logistics.service';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logistics: LogisticsService,
  ) {}

  private db() {
    return this.supabase.admin;
  }

  async assign(
    actorProfileId: string,
    orderId: string,
  ) {
    return this.logistics.assignBestDriver(
      orderId,
      'delivery',
      actorProfileId,
    );
  }

  private async requireDriver(
    profileId: string,
  ) {
    const {
      data,
      error,
    } = await this.db()
      .from('drivers')
      .select(
        'id,is_active',
      )
      .eq(
        'profile_id',
        profileId,
      )
      .maybeSingle();

    if (
      error ||
      !data ||
      !data.is_active
    ) {
      throw new NotFoundException(
        'Active driver profile not found',
      );
    }

    return data;
  }

  private async requireArrivedDeliveryAssignment(
    driverId: string,
    orderId: string,
  ) {
    const {
      data,
      error,
    } = await this.db()
      .from('driver_assignments')
      .select(
        'id,order_id,driver_id,assignment_type,status',
      )
      .eq(
        'order_id',
        orderId,
      )
      .eq(
        'driver_id',
        driverId,
      )
      .eq(
        'assignment_type',
        'delivery',
      )
      .eq(
        'status',
        'arrived',
      )
      .maybeSingle();

    if (
      error ||
      !data
    ) {
      throw new ConflictException(
        'No arrived delivery assignment found for this driver',
      );
    }

    return data;
  }

  private async requireDeliveryOtpPendingOrder(
    orderId: string,
  ) {
    const {
      data,
      error,
    } = await this.db()
      .from('orders')
      .select(
        'id,current_status',
      )
      .eq(
        'id',
        orderId,
      )
      .maybeSingle();

    if (
      error ||
      !data
    ) {
      throw new NotFoundException(
        'Order not found',
      );
    }

    if (
      data.current_status !==
      'delivery_otp_pending'
    ) {
      throw new ConflictException(
        `Delivery completion is not allowed while order is ${data.current_status}`,
      );
    }

    return data;
  }

  private verifyOtpHash(
    otp: string,
    storedHash: string,
  ) {
    const parts =
      storedHash.split(':');

    if (
      parts.length !== 2
    ) {
      return false;
    }

    const [
      salt,
      expectedHex,
    ] = parts;

    let expected: Buffer;

    try {
      expected =
        Buffer.from(
          expectedHex,
          'hex',
        );
    } catch {
      return false;
    }

    if (
      expected.length !== 32
    ) {
      return false;
    }

    const actual =
      scryptSync(
        otp,
        salt,
        32,
      );

    return (
      actual.length ===
        expected.length &&
      timingSafeEqual(
        actual,
        expected,
      )
    );
  }

  async createUploadPath(
    profileId: string,
    orderId: string,
    fileName: string,
  ) {
    const driver =
      await this.requireDriver(
        profileId,
      );

    await this.requireArrivedDeliveryAssignment(
      driver.id,
      orderId,
    );

    await this.requireDeliveryOtpPendingOrder(
      orderId,
    );

    if (
      !fileName ||
      typeof fileName !==
        'string'
    ) {
      throw new BadRequestException(
        'File name is required',
      );
    }

    const rawExtension =
      fileName
        .split('.')
        .pop()
        ?.toLowerCase() ??
      '';

    const allowedExtensions =
      [
        'jpg',
        'jpeg',
        'png',
        'webp',
      ];

    if (
      !allowedExtensions.includes(
        rawExtension,
      )
    ) {
      throw new BadRequestException(
        'Delivery photograph must be JPG, JPEG, PNG, or WEBP',
      );
    }

    const path =
      `${orderId}/${randomUUID()}.${rawExtension}`;

    const {
      data,
      error,
    } = await this.db()
      .storage
      .from(
        'delivery-proofs',
      )
      .createSignedUploadUrl(
        path,
      );

    if (
      error ||
      !data
    ) {
      throw new BadRequestException(
        error?.message ??
          'Unable to create delivery proof upload URL',
      );
    }

    return {
      path,
      signedUrl:
        data.signedUrl,
      token:
        data.token,
    };
  }

  async complete(
    profileId: string,
    orderId: string,
    otp: string,
    photoPath: string,
    latitude?: number,
    longitude?: number,
  ) {
    if (
      !otp ||
      typeof otp !==
        'string'
    ) {
      throw new BadRequestException(
        'Delivery OTP is required',
      );
    }

    if (
      !/^\d{6}$/.test(
        otp,
      )
    ) {
      throw new BadRequestException(
        'Delivery OTP must be 6 digits',
      );
    }

    if (
      !photoPath ||
      typeof photoPath !==
        'string'
    ) {
      throw new BadRequestException(
        'Delivery photograph is mandatory',
      );
    }

    const expectedPrefix =
      `${orderId}/`;

    if (
      !photoPath.startsWith(
        expectedPrefix,
      )
    ) {
      throw new ForbiddenException(
        'Delivery proof does not belong to this order',
      );
    }

    const driver =
      await this.requireDriver(
        profileId,
      );

    const assignment =
      await this.requireArrivedDeliveryAssignment(
        driver.id,
        orderId,
      );

    await this.requireDeliveryOtpPendingOrder(
      orderId,
    );

    const {
      data: otpRow,
      error: otpError,
    } = await this.db()
      .from('order_otps')
      .select('*')
      .eq(
        'order_id',
        orderId,
      )
      .eq(
        'otp_type',
        'delivery',
      )
      .is(
        'verified_at',
        null,
      )
      .order(
        'created_at',
        {
          ascending: false,
        },
      )
      .limit(1)
      .maybeSingle();

    if (
      otpError ||
      !otpRow
    ) {
      throw new NotFoundException(
        'No active delivery OTP',
      );
    }

    if (
      new Date(
        otpRow.expires_at,
      ).getTime() <
      Date.now()
    ) {
      throw new BadRequestException(
        'Delivery OTP expired',
      );
    }

    const attemptCount =
      Number(
        otpRow.attempt_count ??
          0,
      );

    if (
      attemptCount >= 5
    ) {
      throw new BadRequestException(
        'Delivery OTP attempts exceeded',
      );
    }

    if (
      !this.verifyOtpHash(
        otp,
        String(
          otpRow.otp_hash,
        ),
      )
    ) {
      const {
        data: failedAttemptCount,
        error: attemptError,
      } = await this.db().rpc(
        'record_delivery_otp_failure_attempt',
        {
          p_order_id:
            orderId,
          p_otp_id:
            otpRow.id,
          p_expected_otp_hash:
            String(
              otpRow.otp_hash,
            ),
        },
      );

      if (
        attemptError ||
        typeof failedAttemptCount !==
          'number'
      ) {
        throw new BadRequestException(
          attemptError?.message ??
            'Unable to record delivery OTP attempt',
        );
      }

      throw new BadRequestException(
        'Invalid delivery OTP',
      );
    }

    const {
      data,
      error,
    } = await this.db()
      .rpc(
        'complete_delivery_atomic',
        {
          p_order_id:
            orderId,
          p_driver_profile_id:
            profileId,
          p_otp_id:
            otpRow.id,
          p_validated_otp_hash:
            String(
              otpRow.otp_hash,
            ),
          p_photo_path:
            photoPath,
          p_latitude:
            latitude ?? null,
          p_longitude:
            longitude ?? null,
        },
      );

    if (
      error ||
      !data
    ) {
      throw new BadRequestException(
        error?.message ??
          'Unable to complete delivery',
      );
    }

    return {
      ...data,
      orderId:
        data.orderId ??
          orderId,
      assignmentId:
        data.assignmentId ??
        assignment.id,
    };
  }
}
