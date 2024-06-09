// routes/v1/session.routes.ts
import fetch from 'node-fetch';
//const fetch = require('node-fetch');
import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import logger from '../utils/logger';

import Session from '../models/session.model';

interface SessionData {
  id: string;
  sessionCode: string;
  questionCollectionIds: string[];
  isActive: boolean;
  sessionDescription: string;
  sessionName: string;
}

interface WordOccurrences {
  [key: string]: number;
}

interface AidWordOccurrences {
  [aid: string]: WordOccurrences;
}

function filterSessionData(session: Session) {
  const filteredSessionData: SessionData = {
    id: session.id as string,
    sessionCode: session.sessionCode,
    questionCollectionIds: session.questionCollectionIds as string[],
    isActive: session.isActive as boolean,
    sessionDescription: session.sessionDescription as string,
    sessionName: session.sessionName as string,
  };

  return filteredSessionData;
}

interface Params {
  sessionId: string;
  questionId: string;
}

export default function sessionRoutes(fastify: FastifyInstance, options: FastifyPluginOptions, done: () => void) {
  fastify.get(
    '/session/:sessionId/question/:questionId/answers/events',
    async (request: FastifyRequest<{ Params: Params }>, reply) => {
      const abortController = new AbortController();
      let aidWordOccurrences: AidWordOccurrences = {};

      try {
        const { sessionId, questionId } = request.params;
        const url = `http://localhost:5002/session/${sessionId}/question/${questionId}/answers/events`;
        logger.info(`Url: ${url}`);

        const response = await fetch(url, { signal: abortController.signal });

        if (!response.ok) {
          reply.status(500).send({ error: 'Failed to connect to SSE server' });
          return;
        }

        const textStream = response.body;

        if (!textStream) {
          reply.status(500).send({ error: 'Internal Server Error, text stream not ok' });
          return;
        }

        const apiServerResponseHeaders = response.headers.raw();
        for (const headerName in apiServerResponseHeaders) {
          reply.raw.setHeader(headerName, apiServerResponseHeaders[headerName]);
        }

        reply.raw.write(`data: {"message":"[Processing Free Text to Pie] Connected to SSE"}\n\n`);

        let collectedWordOccurrences: WordOccurrences = {};

        textStream.on('data', (chunk: any) => {
          const message = chunk.toString();
          console.log('Message:', message);

          const wordOccurrences = (inputString: any) => {
            const words = inputString.split(' ').filter((word: any) => word !== '');
            const wordCountMap = words.reduce((map: any, word: any) => {
              map[word] = (map[word] || 0) + 1;
              return map;
            }, {} as WordOccurrences);

            return wordCountMap;
          };

          let totalWordOccurrences: WordOccurrences = {};

          let responseMessage: { type?: string; order?: string; values?: any } = {};
          const messageAsJson = JSON.parse(message);
          const aid = messageAsJson.aid;
          console.log('AID:', aid);

          if (messageAsJson.content && messageAsJson.content.value) {
            let wordOccurrenceValues = wordOccurrences(messageAsJson.content.value);
            aidWordOccurrences[aid] = wordOccurrenceValues;

            for (const aid in aidWordOccurrences) {
              const occurrences = aidWordOccurrences[aid];
              for (const [word, count] of Object.entries(occurrences)) {
                totalWordOccurrences[word] = (totalWordOccurrences[word] || 0) + count;
              }
            }

            console.log('Collected word occurrences:', collectedWordOccurrences);
          }

          responseMessage.values = totalWordOccurrences;
          responseMessage.type = 'free-text-to-pie-chart';
          responseMessage.order = 'word-frequency';
          console.log('Response message:', responseMessage);
          reply.raw.write(`data: ${JSON.stringify(responseMessage)}\n\n`);
        });

        textStream.on('end', () => {
          console.log('Stream completed');
          reply.raw.write(`data: {"message": "Stream closed by server"}\n\n`);
          reply.raw.end();
        });

        textStream.on('error', (error: any) => {
          console.error('Error while consuming SSE:', error);
          abortController.abort();
          reply.raw.end();
        });

        request.raw.on('close', () => {
          console.log('Client disconnected, stopping the stream.');
          abortController.abort();
          reply.raw.end();
        });
      } catch (err) {
        logger.error('Error getting session:', err);
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    }
  );

  fastify.get('/session/:sessionId/events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const url = `http://localhost:5000/session/${sessionId}/events`;
      logger.info(`Getting session with ID: ${sessionId}`);

      const abortController = new AbortController();
      const response = await fetch(url, { signal: abortController.signal });

      if (response.ok) {
        const textStream = response.body;

        if (!textStream) {
          reply.status(500).send({ error: 'Internal Server Error, text stream not ok' });
          return;
        }

        const apiServerResponseHeaders = response.headers.raw();
        for (const headerName in apiServerResponseHeaders) {
          reply.raw.setHeader(headerName, apiServerResponseHeaders[headerName]);
        }

        reply.raw.write(`data: {"message":"Connected to SSE"}\n\n`);

        textStream.on('data', (chunk: any) => {
          const message = chunk.toString();

          reply.raw.write(`data: ${message}\n\n`);
        });

        textStream.on('end', () => {
          console.log('Stream completed');
          reply.raw.write(`data: {"message": "Stream closed by server"}\n\n`);
          reply.raw.end();
        });

        textStream.on('error', (error: any) => {
          console.error('Error while consuming SSE:', error);
          abortController.abort();
        });

        request.raw.on('close', () => {
          console.log('Client disconnected, stopping the stream.');
          abortController.abort();
        });
      } else {
        reply.send('Failed to connect to SSE server');
      }
    } catch (err) {
      logger.error('Error getting session:', err);
      reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  done();
}
