import type { FastifyInstance } from 'fastify';
import {
  DEFAULT_FLUSH_THRESHOLD_BYTES,
  DEFAULT_UPLOAD_INTERVAL_MS,
  MAX_BATCH_BYTES,
  type TrackerConfigResponse,
} from '@rrkit/shared';
import type { AppContext } from '../context';
import { metadataFieldsRepo } from '../db/metadataFields.repo';
import { settingsRepo } from '../db/settings.repo';

/** The tracker fetches this at init to learn which features are enabled. */
export async function configRoutes(app: FastifyInstance, _ctx: AppContext): Promise<void> {
  app.get(
    '/config',
    { preHandler: app.requireIngestKey },
    async (): Promise<TrackerConfigResponse> => ({
      features: settingsRepo.getFeatures(),
      privacy: settingsRepo.getPrivacy(),
      metadataKeys: metadataFieldsRepo.keys(),
      maxBatchBytes: MAX_BATCH_BYTES,
      uploadIntervalMs: DEFAULT_UPLOAD_INTERVAL_MS,
      flushThresholdBytes: DEFAULT_FLUSH_THRESHOLD_BYTES,
    }),
  );
}
