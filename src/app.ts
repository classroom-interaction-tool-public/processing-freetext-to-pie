// src/app.ts
import 'dotenv/config';
import cors from '@fastify/cors';

import sessionRoutes from './routes/session.routes';

const app = require('fastify')({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

app.register(cors, {
  origin: ['*'],
  methods: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

app.register(sessionRoutes);

export default app;
