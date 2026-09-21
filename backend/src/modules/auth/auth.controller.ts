import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { PhoneDto, VerifyPhoneOtpDto } from './dto/phone.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('phone/request-otp')
  request(@Body() dto: PhoneDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('phone/verify-otp')
  verify(@Body() dto: VerifyPhoneOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshSessionDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  me(@Req() request: any) {
    return this.auth.me(request.user.id);
  }
}
