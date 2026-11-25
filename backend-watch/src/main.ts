import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  const port = process.env.PORT || 3000;

  await app.listen(port, '0.0.0.0');

  console.log(`Server running on port ${port}`);
  const routes = app
    .getHttpAdapter()
    .getInstance()
    ._router?.stack
    ?.filter((layer: any) => layer.route)
    .map((layer: any) => {
      const route = layer.route;
      return `${Object.keys(route.methods).filter((method) => route.methods[method]).join(',').toUpperCase()} ${route.path}`;
    });
  console.log('Registered HTTP routes:', routes?.join(' | ') ?? 'none');
}

bootstrap();
