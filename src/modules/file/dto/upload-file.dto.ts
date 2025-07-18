import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const UploadFileSchema = z.object({
  file: z.any(),
});

export class UploadFileDto extends createZodDto(UploadFileSchema) {}
