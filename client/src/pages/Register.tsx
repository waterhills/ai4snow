import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuthStore } from '../stores/auth';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [codeMsg, setCodeMsg] = useState('');
  // 倒计时秒数，>0 时按钮禁用
  const [countdown, setCountdown] = useState(0);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  // 倒计时计时器
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // 发送验证码
  const handleSendCode = async () => {
    if (!email) {
      setError('请先输入邮箱地址');
      return;
    }
    setError('');
    setCodeMsg('');
    setCodeSending(true);

    try {
      const res = await authApi.sendCode({ email });
      setCodeMsg(res.data.message || '验证码已发送');
      setCountdown(60);
    } catch (err: any) {
      setError(err.response?.data?.error || '发送验证码失败');
    } finally {
      setCodeSending(false);
    }
  };

  // 提交注册
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authApi.register({ email, password, name: name || undefined, code });
      login(res.data.token, res.data.user);
      navigate('/pricing');
    } catch (err: any) {
      setError(err.response?.data?.error || '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center pt-20 px-6 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-1/4 -right-20 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 -left-20 w-[400px] h-[400px] bg-tertiary/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md">
        <div className="glass-panel border border-outline-variant/30 rounded-2xl p-10 relative overflow-hidden group">
          {/* Top Scanline accent */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>

          <div className="text-center mb-10">
            <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface uppercase mb-2 text-glow">系统部署</h1>
            <p className="text-on-surface-variant font-label text-xs uppercase tracking-widest">初始化包含 3 次免费扫描</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-error-container/20 border border-error/30 flex items-center gap-3">
              <span className="material-symbols-outlined text-error text-xl">warning</span>
              <p className="text-xs text-error font-medium">{error}</p>
            </div>
          )}

          {codeMsg && (
            <div className="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/30 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
              <p className="text-xs text-primary font-medium">{codeMsg}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="group/input relative">
              <label className="block text-[10px] font-label text-on-surface-variant uppercase tracking-widest mb-2" htmlFor="register-name">
                操作员代号 (可选)
              </label>
              <input
                id="register-name"
                type="text"
                className="w-full bg-transparent border-0 border-b border-outline-variant/30 text-on-surface px-2 py-2 focus:ring-0 focus:border-primary transition-colors text-sm font-mono placeholder:text-outline-variant"
                placeholder="输入姓名或别名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="group/input relative">
              <label className="block text-[10px] font-label text-on-surface-variant uppercase tracking-widest mb-2" htmlFor="register-email">
                安全通信频道 (Email)
              </label>
              <input
                id="register-email"
                type="email"
                className="w-full bg-transparent border-0 border-b border-outline-variant/30 text-on-surface px-2 py-2 focus:ring-0 focus:border-primary transition-colors text-sm font-mono placeholder:text-outline-variant"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="group/input relative">
              <label className="block text-[10px] font-label text-on-surface-variant uppercase tracking-widest mb-2" htmlFor="register-password">
                加密密钥 (密码)
              </label>
              <input
                id="register-password"
                type="password"
                className="w-full bg-transparent border-0 border-b border-outline-variant/30 text-on-surface px-2 py-2 focus:ring-0 focus:border-primary transition-colors text-sm font-mono placeholder:text-outline-variant"
                placeholder="最少 6 个字符"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {/* 验证码输入区 */}
            <div className="group/input relative">
              <label className="block text-[10px] font-label text-on-surface-variant uppercase tracking-widest mb-2" htmlFor="register-code">
                邮箱验证码
              </label>
              <div className="flex gap-3">
                <input
                  id="register-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="flex-1 bg-transparent border-0 border-b border-outline-variant/30 text-on-surface px-2 py-2 focus:ring-0 focus:border-primary transition-colors text-sm font-mono placeholder:text-outline-variant tracking-[0.5em]"
                  placeholder="6 位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={codeSending || countdown > 0}
                  className="flex-shrink-0 px-4 py-2 rounded-lg border border-primary/40 text-primary text-xs font-bold uppercase tracking-wider hover:bg-primary/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {codeSending ? (
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  ) : countdown > 0 ? (
                    `${countdown}s`
                  ) : (
                    '发送验证码'
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-6 bg-gradient-to-br from-tertiary to-[#7000ff] text-white font-bold py-4 rounded-xl active:scale-95 transition-transform shadow-[0_0_20px_rgba(172,137,255,0.3)] hover:shadow-[0_0_35px_rgba(172,137,255,0.5)] flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span className="uppercase tracking-widest text-sm">部署并执行</span>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-xs text-on-surface-variant uppercase tracking-widest">
              已有权限？ <Link to="/login" className="text-tertiary hover:text-[#bda1ff] transition-colors ml-2 underline underline-offset-4 decoration-tertiary/30">在此验证</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
