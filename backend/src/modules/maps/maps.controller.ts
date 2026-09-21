import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import {
  ComputeRouteDto,
} from './dto/route.dto';

import {
  ReverseGeocodeDto,
} from './dto/reverse-geocode.dto';

import {
  SearchPlaceDto,
} from './dto/search-place.dto';

import {
  MapsService,
} from './maps.service';

@Controller('maps')
export class MapsController {
  constructor(
    private readonly mapsService:
      MapsService,
  ) {}

  @Post('route')
  route(
    @Body()
    body:
      ComputeRouteDto,
  ) {
    return this.mapsService.getRoute(
      body.origin,
      body.destination,
    );
  }

  @Get('search')
  search(
    @Query()
    query:
      SearchPlaceDto,
  ) {
    return this.mapsService.searchPlaces(
      query.query,
    );
  }

  @Get('place/:placeId')
  place(
    @Param('placeId')
    placeId:
      string,
  ) {
    return this.mapsService.getPlaceDetails(
      placeId,
    );
  }

  @Get('reverse-geocode')
  reverseGeocode(
    @Query()
    query:
      ReverseGeocodeDto,
  ) {
    return this.mapsService.reverseGeocode(
      {
        latitude:
          query.latitude,

        longitude:
          query.longitude,
      },
    );
  }
}
