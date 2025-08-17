import { Injectable, StreamableFile } from '@nestjs/common';
import { PassThrough, Readable } from 'stream';
import axios from 'axios';
import { Response, Request } from 'express';
import { getS3Client } from 'src/common/config/aws.config';
import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { env } from 'src/common/config/env.config';

@Injectable()
export class AudioService {
  private s3 = getS3Client();
  private bucketName = env.AUDIO_BUCKET_NAME;

  // S3 upload method
  async uploadAudio(file: any, title: string, author: string) {
    const timestamp = Date.now();
    const fileName = file.originalname || 'audio';
    const key = `audiobooks/${timestamp}`;

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || 'audio/mpeg',
      Metadata: {
        uploadedAt: new Date().toISOString(),
      },
    });

    await this.s3.send(command);
    const s3Url = `s3://${this.bucketName}/${key}`;

    // In real app, save metadata to database here
    const audioMetadata = {
      id: timestamp,
      title: title,
      author: author,
      s3Key: key,
      s3Url: s3Url,
      size: file.buffer.length,
      uploadedAt: new Date().toISOString(),
    };

    return audioMetadata;
  }

  // S3 get audio stream method
  async getAudioStream(key: string, range?: string) {
    const params: any = {
      Bucket: this.bucketName,
      Key: key,
    };
    if (range) {
      params.Range = range;
    }

    const command = new GetObjectCommand(params);
    return await this.s3.send(command);
  }

  // S3 head object method
  async headObject(key: string) {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return await this.s3.send(command);
  }

  async streamAudio(id: string, range: string, res: Response, req: Request) {
    const s3Key = `audiobooks/${id}`;

    console.log(`Streaming audio with ID: ${id}, Range: ${range || 'full'}`);

    // CORS headers
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
    });

    // Get file metadata
    const headResponse = await this.headObject(s3Key);
    const fileSize = headResponse.ContentLength || 0;
    const contentType = headResponse.ContentType || 'audio/mpeg';

    // Cleanup function
    const cleanup = () => {
      console.log(`Connection cleanup for audio ${id}`);
    };

    // Add cleanup listeners
    req.socket.once('close', () => {
      console.log(`Client disconnected for audio ${id}`);
      cleanup();
    });

    req.socket.once('error', (err) => {
      console.error(`Socket error for audio ${id}:`, err);
      cleanup();
    });

    if (range) {
      // Handle range requests
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const CHUNK_SIZE = 100 * 1024;
      const end = parts[1] // FIX: Use parts[1] instead of parts
        ? parseInt(parts[1], 10)
        : Math.min(start + CHUNK_SIZE - 1, fileSize - 1);

      console.log(`S3 Range request: bytes=${start}-${end}`);

      const s3Response = await this.getAudioStream(
        s3Key,
        `bytes=${start}-${end}`,
      );

      if (!s3Response.Body) {
        throw new Error('Audio not found');
      }

      const chunkSize = end - start + 1;

      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize.toString(),
        'Content-Type': contentType,
      });

      const stream = s3Response.Body as Readable;

      // Clean up stream on connection close
      res.once('close', () => {
        if (!stream.destroyed) {
          stream.destroy();
        }
      });

      return new StreamableFile(stream);
    } else {
      // Full file request
      const s3Response = await this.getAudioStream(s3Key);

      if (!s3Response.Body) {
        throw new Error('Audio not found');
      }

      res.set({
        'Content-Length': fileSize.toString(),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });

      const stream = s3Response.Body as Readable;

      // Clean up stream on connection close
      res.once('close', () => {
        if (!stream.destroyed) {
          stream.destroy();
        }
      });

      return new StreamableFile(stream);
    }
  }

  async getAudioInfo(id: string) {
    // In real app, fetch from database
    const audioInfo = {
      id: id,
      title: 'Sample Audiobook',
      author: 'Sample Author',
      duration: '2:30:45',
      size: '45MB',
      format: 'MP3',
    };

    return audioInfo;
  }

  getCdnUrl(id: string): string {
    const cloudFrontDomain = env.AUDIO_CLOUDFRONT_DOMAIN;
    return `https://${cloudFrontDomain}/audiobooks/${id}`;
  }

  async proxyCdn(id: string, range: string, res: Response) {
    const cloudFrontDomain = env.AUDIO_CLOUDFRONT_DOMAIN;
    const cfUrl = `https://${cloudFrontDomain}/audiobooks/${id}`;

    // Fetch metadata from CloudFront (HEAD)
    const headRes = await axios.head(cfUrl);
    const fileSize = parseInt(headRes.headers['content-length'] || '0', 10);
    const contentType = headRes.headers['content-type'] || 'audio/mpeg';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const CHUNK_SIZE = 100 * 1024;
      const end = parts[1] // FIX: Use parts[1] instead of parts
        ? parseInt(parts[1], 10)
        : Math.min(start + CHUNK_SIZE - 1, fileSize - 1);

      const rangeHeader = `bytes=${start}-${end}`;

      const cfRes = await axios.get(cfUrl, {
        headers: { Range: rangeHeader },
        responseType: 'stream',
      });

      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': (end - start + 1).toString(),
        'Content-Type': contentType,
      });

      const pass = new PassThrough();
      cfRes.data.pipe(pass);
      return new StreamableFile(pass);
    } else {
      // Full file
      const cfRes = await axios.get(cfUrl, { responseType: 'stream' });

      res.set({
        'Content-Length': fileSize.toString(),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });

      const pass = new PassThrough();
      cfRes.data.pipe(pass);
      return new StreamableFile(pass);
    }
  }
}
