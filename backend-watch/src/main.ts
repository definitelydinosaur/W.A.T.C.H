
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
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

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('W.A.T.C.H. API')
    .setDescription('W.A.T.C.H. Backend API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;

  await app.listen(port, '0.0.0.0');

  console.log(`Server running on port ${port}`);
  console.log(`Swagger documentation: http://localhost:${port}/api`);

  const routes = app
    .getHttpAdapter()
    .getInstance()
    ._router?.stack
    ?.filter((layer: any) => layer.route)
    .map((layer: any) => {
      const route = layer.route;
      return `${Object.keys(route.methods)
        .filter((method) => route.methods[method])
        .join(',')
        .toUpperCase()} ${route.path}`;
    });

  console.log(
    'Registered HTTP routes:',
    routes?.join(' | ') ?? 'none',
  );
}

bootstrap();
