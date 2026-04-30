import nodemailer from 'nodemailer';
import { config } from '../config';

// 基于 QQ 邮箱 SMTP 创建 transporter
const transporter = nodemailer.createTransport({
  host: config.mail.host,
  port: config.mail.port,
  secure: true, // 465 端口使用 SSL
  auth: {
    user: config.mail.user,
    pass: config.mail.pass,
  },
});

/**
 * 发送验证码邮件
 * 使用带品牌色的 HTML 模板，提升专业感
 */
export async function sendVerificationCode(email: string, code: string): Promise<void> {
  const html = `
    <div style="max-width: 420px; margin: 0 auto; font-family: 'Segoe UI', Arial, sans-serif; background: #0a0e1a; border-radius: 16px; overflow: hidden; border: 1px solid #1e2a4a;">
      <div style="padding: 32px 28px 20px; text-align: center;">
        <h2 style="margin: 0 0 8px; color: #72dcff; font-size: 22px; letter-spacing: 2px;">SkiVision</h2>
        <p style="margin: 0; color: #8899bb; font-size: 12px; letter-spacing: 4px; text-transform: uppercase;">邮箱验证</p>
      </div>
      <div style="padding: 12px 28px 32px; text-align: center;">
        <p style="color: #c0ccdd; font-size: 14px; margin: 0 0 24px;">您的验证码是：</p>
        <div style="background: #111827; border: 1px solid #72dcff33; border-radius: 12px; padding: 20px; margin: 0 0 24px;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #72dcff; font-family: 'Courier New', monospace;">${code}</span>
        </div>
        <p style="color: #667799; font-size: 12px; margin: 0;">验证码有效期 5 分钟，请勿将验证码泄露给他人。</p>
      </div>
      <div style="padding: 16px 28px; border-top: 1px solid #1e2a4a; text-align: center;">
        <p style="color: #445566; font-size: 11px; margin: 0;">© ${new Date().getFullYear()} SkiVision — 精准高山滑雪智能分析平台</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"SkiVision" <${config.mail.user}>`,
    to: email,
    subject: '【SkiVision】邮箱验证码',
    html,
  });
}
