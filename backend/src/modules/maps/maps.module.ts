import { Module } from '@nestjs/common';
import { getProviderConfiguration } from '../../config/provider-config';
import { GoogleMapsProvider } from './google-maps.provider';
import { MAPS_PROVIDER } from './maps.provider';
import { MapsController } from './maps.controller';
import { MapsService } from './maps.service';
import { MockMapsProvider } from './mock-maps.provider';

@Module({
  controllers: [MapsController],
  providers: [
    {
      provide: MAPS_PROVIDER,
      useFactory: () => {
        const configuration = getProviderConfiguration();
        return configuration.maps.mode === 'mock'
          ? new MockMapsProvider()
          : new GoogleMapsProvider(configuration.maps.serverKey!);
      },
    },
    MapsService,
  ],
  exports: [MapsService],
})
export class MapsModule {}
