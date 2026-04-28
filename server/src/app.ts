import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './lib/env';
import { loadSession } from './middleware/auth';
import { notFound, errorHandler } from './middleware/errors';
import authRouter from './routes/auth';
import courtsRouter from './routes/courts';
import weatherRouter from './routes/weather';
import playabilityRouter from './routes/playability';
import courtRouter from './routes/court';
import meCourtsRouter from './routes/meCourts';
import meListsRouter from './routes/meLists';

export function createApp() {
  const app = express();

  // Trust the platform proxy (Railway, Render, etc.) so req.protocol and
  // req.ip reflect the original client request, not the internal hop.
  app.set('trust proxy', 1);

  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use(loadSession);

  const upstreamLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api/courts', upstreamLimiter, courtsRouter);
  app.use('/api/weather', upstreamLimiter, weatherRouter);
  app.use('/api/playability', upstreamLimiter, playabilityRouter);
  app.use('/api/court', courtRouter);
  app.use('/api/me/courts', meCourtsRouter);
  app.use('/api/me/lists', meListsRouter);

  // In production, serve the built Vite client from the same origin so we
  // don't need a separate static host (Netlify) or CORS at all. The build
  // pipeline (server/package.json `build` script) emits client/dist, which
  // sits at server/../client/dist relative to compiled JS at server/dist/.
  // In dev (tsx watch), client/dist usually doesn't exist — the existsSync
  // guard skips static serving so Vite's dev server stays the source of
  // truth on :5173.
  const clientDistPath = path.resolve(__dirname, '..', '..', 'client', 'dist');
  const clientIndexPath = path.join(clientDistPath, 'index.html');
  if (fs.existsSync(clientIndexPath)) {
    app.use(express.static(clientDistPath));
    // SPA fallback: any non-API GET serves index.html so client-side
    // routing works on hard refresh / direct URL navigation.
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(clientIndexPath);
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
