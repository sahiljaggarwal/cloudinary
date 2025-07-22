import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3000),

  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),

  ORIGINAL_BUCKET_NAME: z.string().min(1),
  TRANSFORMED_BUCKET_NAME: z.string().min(1),

  ORIGINAL_CLOUDFRONT_DOMAIN: z.string(),
  TRANSFORMED_CLOUDFRONT_DOMAIN: z.string(),

  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
