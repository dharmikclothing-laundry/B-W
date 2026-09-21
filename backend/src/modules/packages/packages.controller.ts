import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';

import { PackagesService } from './packages.service';

@Controller('packages')
export class PackagesController {
  constructor(
    private readonly packages: PackagesService,
  ) {}

  @Get()
  list() {
    return this.packages.list();
  }

  @Get('me')
  mine(@Req() req: any) {
    return this.packages.mine(req.user.id);
  }

  @Get('me/usage')
  usage(@Req() req: any) {
    return this.packages.usage(req.user.id);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.packages.detail(id);
  }

  @Post(':id/subscribe')
  subscribe(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.packages.subscribe(
      req.user.id,
      id,
    );
  }

}
