import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json } from "express";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Default 100kb body limit is too small for Payment Links' base64 product photos
  // (up to ~2MB image, see CreatePaymentLinkDto).
  app.use(json({ limit: "3mb" }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: config.get<string[]>("app.corsOrigins"), credentials: false });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("pagosYa API")
    .setDescription(
      "Gateway API for pagosYa (APP / Administradora de Pasarela de Pagos). " +
        "Test-mode keys work end to end against mock rail adapters — see the " +
        "PaymentMethod token docs on POST /v1/payment_intents/{id}/confirm.",
    )
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const port = config.get<number>("app.port") ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`pagosYa API listening on http://localhost:${port} (docs at /docs)`);
}

bootstrap();
