import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './bootstrap';
import { APP_CONFIG, AppConfig } from './config/config';

async function main(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS);
    configureApp(app);
    const config = app.get<AppConfig>(APP_CONFIG);
    await app.listen(config.port);
    app.get(Logger).log(`PLUG EV API listening on http://localhost:${config.port}/api/v1 (docs: /api/docs)`);
}

main().catch(err => {
    // Configuration errors are printed plainly so they are easy to read.
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
