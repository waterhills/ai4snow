import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

/**
 * 管理员权限中间件
 * 必须在 authMiddleware 之后使用
 */
export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.userRole !== 'ADMIN') {
    res.status(403).json({ error: '需要管理员权限' });
    return;
  }
  next();
}
