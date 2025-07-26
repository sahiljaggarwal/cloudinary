// redis.service.ts
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from 'src/common/config/env.config';

@Injectable()
export class RedisService {
  private client = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  });

  async getBuffer(key: string): Promise<Buffer | null> {
    const data = await this.client.getBuffer(key);
    return data ? Buffer.from(data) : null;
  }

  async setBuffer(key: string, buffer: Buffer, ttl = 86400) {
    await this.client.set(key, buffer, 'EX', ttl);
  }
}
