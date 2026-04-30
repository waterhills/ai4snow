import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { userApi } from '../services/api';
import { useAuthStore } from '../stores/auth';

export default function Pricing() {
  const [loading, setLoading] = useState(true);
  const { user, updateCredits, isLoggedIn } = useAuthStore();

  useEffect(() => {
    if (isLoggedIn) {
      userApi.getProfile()
        .then((res) => updateCredits(res.data.user.credits))
        .catch((err) => console.error('加载数据失败:', err))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [isLoggedIn, updateCredits]);

  return (
    <main className="pt-32 pb-20 px-8 max-w-screen-2xl mx-auto">
      {/* 个人信息区域 (仅当已登录时显示) */}
      {isLoggedIn && (
        <section className="max-w-md mx-auto mb-24">
          <div className="bg-surface-container-high p-8 rounded-xl relative overflow-hidden group border border-outline-variant/10 mb-6">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-8xl" style={{ fontSize: '96px' }}>database</span>
            </div>
            <h2 className="font-headline text-on-surface-variant text-sm tracking-widest uppercase mb-4">当前容量</h2>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-6xl font-headline font-bold text-primary tracking-tighter">
                {user?.credits ?? 0}
              </span>
              <span className="text-on-surface-variant font-label text-sm uppercase tracking-widest">/ 代币 (Tokens)</span>
            </div>
            <div className="w-full bg-surface-variant h-1 rounded-full mb-8">
              <div
                className="bg-gradient-to-r from-primary to-primary-container h-full rounded-full"
                style={{ width: `${Math.min(((user?.credits ?? 0) / 100) * 100, 100)}%` }}
              ></div>
            </div>
            <button
              onClick={() => { document.getElementById('pricing-tiers')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="w-full py-4 bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-bold rounded-xl active:scale-95 transition-transform btn-glow uppercase tracking-wider text-sm"
            >
              充值额度
            </button>
          </div>

          <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/15 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-surface-bright flex items-center justify-center border border-primary/20">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              </div>
              <div>
                <p className="text-on-surface font-semibold truncate max-w-[200px]">{user?.email}</p>
                <p className="text-xs text-on-surface-variant uppercase tracking-wider">{user?.role === 'ADMIN' ? '系统管理员' : '操作员'}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== Pricing Section ===== */}
      <section id="pricing-tiers" className="py-10 relative">
        <div className="text-center max-w-2xl mx-auto mb-16">
          {!isLoggedIn && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-highest border border-primary/20 mb-8">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span className="text-xs font-label uppercase tracking-widest text-primary">登录以访问控制面板</span>
            </div>
          )}
          <h2 className="font-headline text-5xl md:text-6xl font-bold tracking-tighter mb-4 text-glow text-on-surface">扩展您的智能</h2>
          <p className="text-on-surface-variant text-lg">为不同层级的探索提供先进的算法阶梯。精准工程，按需服务。</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {/* Trial / Free */}
          <div className="glass-panel p-10 rounded-2xl border border-outline-variant/20 flex flex-col hover:border-primary/30 transition-all opacity-80">
            <div className="mb-10">
              <h3 className="text-xl font-headline font-bold text-on-surface mb-2">基础试用</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-headline font-bold text-on-surface">¥0</span>
                <span className="text-on-surface-variant text-sm">/ 终身</span>
              </div>
            </div>
            <ul className="space-y-4 mb-12 flex-grow">
              <li className="flex items-center gap-3 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                赠送 3 次初始分析额度
              </li>
              <li className="flex items-center gap-3 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                基础姿态估计图表
              </li>
              <li className="flex items-center gap-3 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                标准处理优先级
              </li>
            </ul>
            {isLoggedIn ? (
              <button className="w-full py-4 text-center glass-panel border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors opacity-50 cursor-not-allowed">
                已激活
              </button>
            ) : (
              <Link to="/register" className="w-full text-center py-4 glass-panel border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors">
                立即初始化
              </Link>
            )}
          </div>

          {/* Single Purchase */}
          <div className="glass-panel p-10 rounded-2xl border border-outline-variant/20 flex flex-col hover:border-primary/30 transition-all">
            <div className="mb-10">
              <h3 className="text-xl font-headline font-bold text-on-surface mb-2">次数购买</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-headline font-bold text-on-surface">¥9.9</span>
                <span className="text-on-surface-variant text-sm">/ 次</span>
              </div>
            </div>
            <ul className="space-y-4 mb-12 flex-grow">
              <li className="flex items-center gap-3 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                单次深度视觉分析
              </li>
              <li className="flex items-center gap-3 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                即买即用，永久有效
              </li>
              <li className="flex items-center gap-3 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                完整滑行压力评估
              </li>
            </ul>
            <button className="w-full py-4 bg-surface-bright border border-primary/40 text-primary font-bold rounded-xl hover:bg-primary/10 transition-all active:scale-95">
              立即充值
            </button>
          </div>

          {/* Subscription */}
          <div className="bg-surface-container-high p-10 rounded-2xl border-2 border-primary relative flex flex-col transform md:-translate-y-4 shadow-[0_0_40px_rgba(114,220,255,0.1)]">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-on-primary-fixed px-4 py-1 rounded-full text-xs font-bold tracking-widest uppercase">
                最受欢迎
            </div>
            <div className="mb-10">
              <h3 className="text-xl font-headline font-bold text-primary mb-2">订阅制</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-headline font-bold text-on-surface">¥49.9</span>
                <span className="text-on-surface-variant text-sm">/ 月</span>
              </div>
            </div>
            <ul className="space-y-4 mb-12 flex-grow">
              <li className="flex items-center gap-3 text-on-surface text-sm font-medium">
                <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                每天 3 次分析额度
              </li>
              <li className="flex items-center gap-3 text-on-surface text-sm font-medium">
                <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                优先处理队列
              </li>
            </ul>
            <button className="w-full py-4 bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-bold rounded-xl active:scale-95 transition-transform btn-glow shadow-lg shadow-primary/20">
              立即订阅
            </button>
          </div>
        </div>
      </section>

      {/* Asymmetric Data Visualization Placeholder from Pricing Design */}
      <section className="mt-32 relative h-[400px] rounded-3xl overflow-hidden mb-10">
        <img
            className="w-full h-full object-cover opacity-40 mix-blend-screen"
            alt="abstract tech mesh overlay"
            src="https://images.unsplash.com/photo-1544256718-3bcf237f3974?q=80&w=2071&auto=format&fit=crop"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
        <div className="absolute inset-0 flex items-center px-12">
            <div className="max-w-xl">
                <span className="text-primary font-label text-xs uppercase tracking-[0.4em] mb-4 block">系统完整性</span>
                <h2 className="font-headline text-4xl font-bold text-on-surface leading-tight mb-6">以 0.004ms 延迟处理冰川遥测数据。</h2>
                <div className="flex gap-12">
                    <div>
                        <span className="block text-2xl font-headline font-bold text-primary">12.4 TB</span>
                        <span className="text-xs text-on-surface-variant uppercase tracking-widest">已处理数据</span>
                    </div>
                    <div>
                        <span className="block text-2xl font-headline font-bold text-tertiary">99.9%</span>
                        <span className="text-xs text-on-surface-variant uppercase tracking-widest">在线时间指标</span>
                    </div>
                </div>
            </div>
        </div>
      </section>
    </main>
  );
}
