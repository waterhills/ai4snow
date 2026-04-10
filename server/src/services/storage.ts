import fs from 'fs';
import path from 'path';
import { config } from '../config';

/**
 * 确保上传目录和结果目录存在
 * 在服务启动时调用
 */
export function ensureUploadDir(): void {
  const uploadDir = path.resolve(config.uploadDir);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const resultsDir = path.join(uploadDir, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
}

export function getFilePath(fileKey: string): string {
  return path.resolve(config.uploadDir, fileKey);
}

export function deleteFile(fileKey: string): void {
  const filePath = getFilePath(fileKey);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
