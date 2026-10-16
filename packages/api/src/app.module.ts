import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { ENDPOINTS } from './http/endpoints';
import { endpointControllers } from './http/nest/endpoint.controllers';

@Module({
  imports: [CoreModule],
  controllers: endpointControllers(ENDPOINTS),
})
export class AppModule {}
