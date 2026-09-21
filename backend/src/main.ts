import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule, new FastifyAdapter(), { rawBody: true },
  );
  await configureApp(app);
  app.enableShutdownHooks();
  await app.listen({ port: Number(process.env.PORT || 3000), host: '0.0.0.0' });
}

void bootstrap();
