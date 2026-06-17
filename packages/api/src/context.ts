import type { Env } from './config/env';
import type { S3Service } from './services/s3.service';

export interface AppContext {
  env: Env;
  s3: S3Service;
}
