import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN || '7d') as string,
  redisUrl: process.env.REDIS_URL || '',
  internalApiKey: process.env.INTERNAL_API_KEY || 'dev-internal-key',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
};
