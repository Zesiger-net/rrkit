import 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import type { S3Service } from './services/s3.service';

declare module 'fastify' {
  interface FastifyInstance {
    s3: S3Service;
    /** Reject unless a valid admin JWT cookie is present. */
    requireAdmin: preHandlerHookHandler;
    /** Reject unless a valid ingest key is presented (header/query/body). */
    requireIngestKey: preHandlerHookHandler;
  }

  interface FastifyRequest {
    /** Populated by requireIngestKey. */
    ingestKey?: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}
