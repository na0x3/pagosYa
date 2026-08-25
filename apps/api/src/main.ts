import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { PrismaService } from "./prisma/prisma.service";

const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function safeJsonReviver(key: string, value: unknown): unknown {
  if (UNSAFE_OBJECT_KEYS.has(key)) throw new SyntaxError("Unsafe JSON object key");
  return value;
}

function jsonIsTooComplex(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const stack: Array<{ value: object; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop()!;
    if (current.depth > 32 || ++nodes > 10_000) return true;
    for (const child of Object.values(current.value)) {
      if (child && typeof child === "object") stack.push({ value: child, depth: current.depth + 1 });
    }
  }
  return false;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const isProduction = config.get<string>("app.environment") === "production";
  const trustProxy = config.get<false | number | string>("app.trustProxy") ?? false;
  if (trustProxy !== false) app.set("trust proxy", trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
      strictTransportSecurity: isProduction ? undefined : false,
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    if (!req.path.startsWith("/docs")) {
      res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    }
    next();
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const bodyMethod = req.method === "POST" || req.method === "PUT" || req.method === "PATCH";
    const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || Boolean(req.headers["transfer-encoding"]);
    if (!bodyMethod || !hasBody) return next();
    const multipartUpload = req.path === "/v1/uploads" && req.is("multipart/form-data");
    if (multipartUpload || req.is(["application/json", "application/*+json"])) return next();
    return res.status(415).json({ statusCode: 415, message: "Unsupported Media Type" });
  });

  // Slightly above Express's 100kb default for general headroom. Product photos and
  // merchant logos go through multipart uploads (see UploadsModule), not JSON bodies,
  // so this limit no longer needs to accommodate base64 image payloads.
  app.use(json({ limit: "1mb", strict: true, reviver: safeJsonReviver }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (jsonIsTooComplex(req.body)) {
      return res.status(400).json({ statusCode: 400, message: "JSON body is too deeply nested or complex" });
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  const configuredOrigins = new Set(config.get<string[]>("app.corsOrigins") ?? []);
  let customStorefrontOrigins = new Set<string>();
  const refreshCustomOrigins = async () => {
    try {
      const domains = await app.get(PrismaService).customDomain.findMany({
        where: { status: "ACTIVE", store: { status: "ACTIVE", merchant: { status: "ACTIVE" } } },
        select: { hostname: true },
      });
      customStorefrontOrigins = new Set(domains.map(({ hostname }) => `https://${hostname}`));
    } catch {
      Logger.warn("Could not refresh active custom-domain CORS origins", "SecurityBootstrap");
    }
  };
  await refreshCustomOrigins();
  setInterval(refreshCustomOrigins, 60_000).unref();
  app.enableCors({
    origin(origin, callback) {
      if (!origin || configuredOrigins.has(origin) || customStorefrontOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "idempotency-key"],
    maxAge: 600,
  });

  if (config.get<boolean>("app.exposeDocs")) {
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
  }

  const port = config.get<number>("app.port") ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`pagosYa API listening on http://localhost:${port}`);
}

bootstrap();
