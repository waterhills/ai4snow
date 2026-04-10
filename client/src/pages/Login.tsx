import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuthStore } from '../stores/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authApi.login({ email, password });
      login(res.data.token, res.data.user);
      navigate('/pricing');
    } catch (err: any) {
      setError(err.response?.data?.error || '登录失败，请稍后重试');
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
            <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface uppercase mb-2 text-glow">Authorization</h1>
            <p className="text-on-surface-variant font-label text-sm uppercase tracking-widest">Identify to Glacial Lab</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-error-container/20 border border-error/30 flex items-center gap-3">
              <span className="material-symbols-outlined text-error text-xl">warning</span>
              <p className="text-xs text-error font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="group/input relative">
              <label className="block text-[10px] font-label text-on-surface-variant uppercase tracking-widest mb-2" htmlFor="login-email">
                Ident-String (Email)
              </label>
              <input
                id="login-email"
                type="email"
                className="w-full bg-transparent border-0 border-b border-outline-variant/30 text-on-surface px-2 py-2 focus:ring-0 focus:border-primary transition-colors text-sm font-mono placeholder:text-outline-variant"
                placeholder="operative@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="group/input relative">
              <label className="block text-[10px] font-label text-on-surface-variant uppercase tracking-widest mb-2" htmlFor="login-password">
                Pass-Key
              </label>
              <input
                id="login-password"
                type="password"
                className="w-full bg-transparent border-0 border-b border-outline-variant/30 text-on-surface px-2 py-2 focus:ring-0 focus:border-primary transition-colors text-sm font-mono placeholder:text-outline-variant"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="w-full mt-4 bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-bold py-4 rounded-xl active:scale-95 transition-transform btn-glow shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-on-primary-fixed border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span className="uppercase tracking-widest text-sm">Authenticate</span>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-xs text-on-surface-variant uppercase tracking-widest">
              No clearance? <Link to="/register" className="text-primary hover:text-primary-container transition-colors ml-2 underline underline-offset-4 decoration-primary/30">Deploy Here</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
