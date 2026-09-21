import {Body,Controller,Get,Post,Req,UseGuards} from '@nestjs/common'; import {GrowthService} from './growth.service';import {SupabaseAuthGuard} from '../../common/guards/supabase-auth.guard';
@Controller('growth') @UseGuards(SupabaseAuthGuard) export class GrowthController{constructor(private readonly s:GrowthService){}
@Get('offers') offers(){return this.s.activeOffers();}
@Post('coupon') coupon(@Req()r:any,@Body()b:{code:string;orderAmount:number}){return this.s.applyCoupon(r.user.id,b.code,b.orderAmount);}
@Get('referral') referralInfo(@Req()r:any){return this.s.referralInfo(r.user.id);}
@Post('referral') referral(@Req()r:any,@Body()b:{code:string}){return this.s.referral(r.user.id,b.code);}
@Get('loyalty') loyalty(@Req()r:any){return this.s.points(r.user.id);}
@Get('rules') rules(){return this.s.rules();}
}
