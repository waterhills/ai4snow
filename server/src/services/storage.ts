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

  const inputsDir = path.join(uploadDir, 'inputs');
  if (!fs.existsSync(inputsDir)) {
    fs.mkdirSync(inputsDir, { recursive: true });
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

/**
 * 删除任务关联的所有文件（输入 + 结果），忽略不存在的文件
 */
export function deleteTaskFiles(task: {
  inputFileKey: string;
  resultFileKey: string | null;
  resultFileKey2: string | null;
}): void {
  deleteFile(`inputs/${task.inputFileKey}`);
  if (task.resultFileKey) {
    deleteFile(`results/${task.resultFileKey}`);
  }
  if (task.resultFileKey2) {
    deleteFile(`results/${task.resultFileKey2}`);
  }
}
