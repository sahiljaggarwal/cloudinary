import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const GetFileSchema = z.object({
  key: z.string(),
  height: z.string().optional(),
  width: z.string().optional(),
  quality: z.string().optional(),
});

export class GetFileDto extends createZodDto(GetFileSchema) {}
