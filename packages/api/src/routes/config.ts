import type { FastifyInstance } from 'fastify';
import { MAX_BATCH_BYTES, type TrackerConfigResponse } from '@rrkit/shared';
import type { AppContext } from '../context';
import { metadataFieldsRepo } from '../db/metadataFields.repo';
import { settingsRepo } from '../db/settings.repo';

/** The tracker fetches this at init to learn which features are enabled. */
export async function configRoutes(app: FastifyInstance, _ctx: AppContext): Promise<void> {
  app.get(
    '/config',
    { preHandler: app.requireIngestKey },
    async (): Promise<TrackerConfigResponse> => {
      const upload = settingsRepo.getUpload();
      return {
        features: settingsRepo.getFeatures(),
        privacy: settingsRepo.getPrivacy(),
        canvas: settingsRepo.getCanvas(),
        frustration: settingsRepo.getFrustration(),
        volume: settingsRepo.getVolume(),
        dom: settingsRepo.getDom(),
        console: settingsRepo.getConsole(),
        upload,
        network: settingsRepo.getNetwork(),
        sampling: settingsRepo.getSampling(),
        metadataKeys: metadataFieldsRepo.keys(),
        maxBatchBytes: MAX_BATCH_BYTES,
        // Back-compat mirror for trackers built before the `upload` group existed.
        uploadIntervalMs: upload.uploadIntervalMs,
        flushThresholdBytes: upload.flushThresholdBytes,
      };
    },
  );
}
