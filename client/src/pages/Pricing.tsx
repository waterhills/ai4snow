import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { taskApi, userApi } from '../services/api';
import { useAuthStore } from '../stores/auth';

interface Task {
  id: string;
  status: string;
  inputFileKey: string;
  resultFileKey: string | null;
  createdAt: string;
  completedAt: string | null;
}

export default function Pricing() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const { user, updateCredits, isLoggedIn } = useAuthStore();

  useEffect(() => {
    if (isLoggedIn) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [page, isLoggedIn]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [taskRes, profileRes] = await Promise.all([
        taskApi.list(page, 10),
        userApi.getProfile(),
      ]);
      setTasks(taskRes.data.tasks);
      setTotal(taskRes.data.total);
      updateCredits(profileRes.data.user.credits);
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const statusMap: Record<string, { label: string; colorClass: string; icon: string }> = {
    PENDING: { label: 'Pending', colorClass: 'border-l-warning', icon: 'hourglass_empty' },
    PROCESSING: { label: 'Processing', colorClass: 'border-l-secondary', icon: 'sync' },
    COMPLETED: { label: 'Completed', colorClass: 'border-l-primary', icon: 'check_circle' },
    FAILED: { label: 'Failed', colorClass: 'border-l-error', icon: 'error' },
  };

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return {
      month: months[d.getMonth()],
      day: d.getDate().toString().padStart(2, '0')
    };
  };

  const totalPages = Math.ceil(total / 10);

  return (
    <main className="pt-32 pb-20 px-8 max-w-screen-2xl mx-auto">
      {/* 个人信息及历史仪表盘区域 (仅当已登录时显示) */}
      {isLoggedIn && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-24">
          
          {/* User Credits Widget */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="bg-surface-container-high p-8 rounded-xl relative overflow-hidden group border border-outline-variant/10">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <span className="material-symbols-outlined text-8xl" style={{ fontSize: '96px' }}>database</span>
              </div>
              <h2 className="font-headline text-on-surface-variant text-sm tracking-widest uppercase mb-4">Current Capacity</h2>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-6xl font-headline font-bold text-primary tracking-tighter">
                  {user?.credits ?? 0}
                </span>
                <span className="text-on-surface-variant font-label text-sm uppercase tracking-widest">/ Tokens</span>
              </div>
              <div className="w-full bg-surface-variant h-1 rounded-full mb-8">
                <div 
                  className="bg-gradient-to-r from-primary to-primary-container h-full rounded-full" 
                  style={{ width: `${Math.min(((user?.credits ?? 0)/100)*100, 100)}%` }}
                ></div>
              </div>
              <button 
                onClick={() => { document.getElementById('pricing-tiers')?.scrollIntoView({ behavior: 'smooth' }); }}
                className="w-full py-4 bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-bold rounded-xl active:scale-95 transition-transform btn-glow uppercase tracking-wider text-sm"
              >
                Top Up Credits
              </button>
            </div>

            <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/15 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-surface-bright flex items-center justify-center border border-primary/20">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                </div>
                <div>
                  <p className="text-on-surface font-semibold truncate max-w-[150px]">{user?.email}</p>
                  <p className="text-xs text-on-surface-variant uppercase tracking-wider">{user?.role === 'ADMIN' ? 'SYSADMIN' : 'Operative'}</p>
                </div>
              </div>
              <div className="text-center bg-surface-variant px-3 py-1 rounded border border-outline-variant/20">
                 <span className="block text-[10px] text-on-surface-variant uppercase">Runs</span>
                 <span className="block font-bold text-tertiary">{total}</span>
              </div>
            </div>
          </div>

          {/* Analysis History Table */}
          <div className="lg:col-span-8 bg-surface-container-low rounded-xl p-8 border border-outline-variant/10">
            <div className="flex justify-between items-end mb-8 border-b border-outline-variant/15 pb-4">
              <div>
                <h2 className="font-headline text-3xl font-bold tracking-tight text-on-surface uppercase">Telemetry History</h2>
                <p className="text-on-surface-variant text-sm mt-1">Reviewing your processed kinetic sequences.</p>
              </div>
              <Link to="/upload" className="flex items-center gap-2 text-primary text-sm font-label uppercase tracking-widest hover:underline underline-offset-4">
                <span className="material-symbols-outlined text-lg">add_circle</span> New Run
              </Link>
            </div>

            {loading ? (
               <div className="py-20 flex flex-col items-center justify-center">
                  <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                  <span className="text-on-surface-variant uppercase tracking-widest text-xs">Querying Database...</span>
               </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-20 bg-surface-container-highest/20 rounded-xl border border-outline-variant/5 border-dashed">
                 <span className="material-symbols-outlined text-6xl text-outline-variant mb-4">analytics</span>
                 <h3 className="text-xl font-bold mb-2">No sequences found</h3>
                 <p className="text-on-surface-variant text-sm mb-6 max-w-sm mx-auto">You haven't uploaded any footage to the Glacial Engine. Start your first analysis to see data here.</p>
                 <Link to="/upload" className="px-6 py-3 border border-primary/40 text-primary font-bold rounded hover:bg-primary/5 transition-all text-sm uppercase tracking-widest">
                    Initialize Upload
                 </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {tasks.map((task) => {
                   const date = formatShortDate(task.createdAt);
                   const statusInfo = statusMap[task.status] || { label: task.status, colorClass: 'border-l-outline-variant', icon: 'help' };
                   let scoreLabel = "N/A";
                   if(task.status === 'COMPLETED') scoreLabel = "READY";
                   
                   return (
                    <Link to={`/results/${task.id}`} key={task.id} className={`block flex items-center justify-between p-4 bg-surface-container rounded-lg border-l-2 ${statusInfo.colorClass} group hover:bg-surface-container-high transition-colors`}>
                      <div className="flex items-center gap-6">
                        <div className="text-center w-12 hidden sm:block">
                          <span className="block text-xs text-on-surface-variant font-bold uppercase tracking-widest">{date.month}</span>
                          <span className="block text-xl font-headline font-bold">{date.day}</span>
                        </div>
                        <div>
                          <h3 className="text-on-surface font-medium truncate max-w-[200px] md:max-w-md">
                            {task.inputFileKey.split('.').pop()?.toUpperCase()} SEQUENCE_{task.id.slice(0,6)}
                          </h3>
                          <p className="text-xs text-on-surface-variant mt-1 font-mono uppercase">
                            <span className="material-symbols-outlined text-[14px] inline-block mr-1">{statusInfo.icon}</span>
                            Status: {statusInfo.label}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right hidden sm:block">
                          <span className="block text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">State</span>
                          <span className={`font-headline font-bold text-lg ${task.status === 'COMPLETED' ? 'text-primary' : task.status === 'FAILED' ? 'text-error' : 'text-secondary'}`}>
                            {scoreLabel}
                          </span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-surface-lowest flex items-center justify-center border border-outline-variant/20 group-hover:border-primary/50 transition-colors">
                          <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">chevron_right</span>
                        </div>
                      </div>
                    </Link>
                   );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-8 pt-4 border-t border-outline-variant/10">
                 <button 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 bg-surface-container border border-outline-variant/30 rounded text-xs uppercase font-bold tracking-widest hover:bg-surface-variant disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                 </button>
                 <span className="text-on-surface-variant text-sm font-mono">{page} / {totalPages}</span>
                 <button 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 bg-surface-container border border-outline-variant/30 rounded text-xs uppercase font-bold tracking-widest hover:bg-surface-variant disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                 </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===== Pricing Section ===== */}
      <section id="pricing-tiers" className="py-10 relative">
        <div className="text-center max-w-2xl mx-auto mb-16">
          {!isLoggedIn && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-highest border border-primary/20 mb-8">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span className="text-xs font-label uppercase tracking-widest text-primary">Login to access dashboard</span>
            </div>
          )}
          <h2 className="font-headline text-5xl md:text-6xl font-bold tracking-tighter mb-4 text-glow text-on-surface">Scale Your Intelligence</h2>
          <p className="text-on-surface-variant text-lg">Advanced algorithmic tiers for every level of exploration. Precision engineering delivered as a service.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {/* Trial / Free */}
          <div className="glass-panel p-10 rounded-2xl border border-outline-variant/20 flex flex-col hover:border-primary/30 transition-all">
            <div className="mb-10">
              <h3 className="text-xl font-headline font-bold text-on-surface mb-2">Novice</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-headline font-bold text-on-surface">$0</span>
                <span className="text-on-surface-variant text-sm">/ Lifetime</span>
              </div>
            </div>
            <ul className="space-y-4 mb-12 flex-grow">
              <li className="flex items-center gap-3 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                3 Analysis tokens
              </li>
              <li className="flex items-center gap-3 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                Basic Telemetry Graphs
              </li>
              <li className="flex items-center gap-3 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                Standard Support
              </li>
            </ul>
            {isLoggedIn ? (
              <button className="w-full py-4 text-center glass-panel border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors opacity-50 cursor-not-allowed">
                Current Plan
              </button>
            ) : (
              <Link to="/register" className="w-full text-center py-4 glass-panel border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors">
                Initialize Account
              </Link>
            )}
          </div>

          {/* Pro */}
          <div className="bg-surface-container-high p-10 rounded-2xl border-2 border-primary relative flex flex-col transform md:-translate-y-4 shadow-[0_0_40px_rgba(114,220,255,0.1)]">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-on-primary-fixed px-4 py-1 rounded-full text-xs font-bold tracking-widest uppercase">
                Most Advanced
            </div>
            <div className="mb-10">
              <h3 className="text-xl font-headline font-bold text-primary mb-2">Pro</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-headline font-bold text-on-surface">¥49</span>
                <span className="text-on-surface-variant text-sm">/ Month</span>
              </div>
            </div>
            <ul className="space-y-4 mb-12 flex-grow">
              <li className="flex items-center gap-3 text-on-surface text-sm font-medium">
                <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                500 Analysis tokens / Month
              </li>
              <li className="flex items-center gap-3 text-on-surface text-sm font-medium">
                <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                Predictive Maps
              </li>
              <li className="flex items-center gap-3 text-on-surface text-sm font-medium">
                <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                Priority Queue Access
              </li>
            </ul>
            <button className="w-full py-4 bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-bold rounded-xl active:scale-95 transition-transform btn-glow shadow-lg shadow-primary/20">
              Buy Now
            </button>
          </div>

          {/* Elite / Coach */}
          <div className="glass-panel p-10 rounded-2xl border border-outline-variant/20 flex flex-col hover:border-primary/30 transition-all">
            <div className="mb-10">
              <h3 className="text-xl font-headline font-bold text-on-surface mb-2">Elite</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-headline font-bold text-on-surface">¥449</span>
                <span className="text-on-surface-variant text-sm">/ Year</span>
              </div>
            </div>
            <ul className="space-y-4 mb-12 flex-grow">
              <li className="flex items-center gap-3 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                Unlimited Tokens
              </li>
              <li className="flex items-center gap-3 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                Full Lab API Access
              </li>
              <li className="flex items-center gap-3 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                Neural Custom Models
              </li>
            </ul>
            <button className="w-full py-4 bg-surface-bright border border-primary/40 text-primary font-bold rounded-xl hover:bg-primary/10 transition-all active:scale-95">
              Contact Command
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
                <span className="text-primary font-label text-xs uppercase tracking-[0.4em] mb-4 block">System Integrity</span>
                <h2 className="font-headline text-4xl font-bold text-on-surface leading-tight mb-6">Processing glacial telemetry with 0.004ms latency.</h2>
                <div className="flex gap-12">
                    <div>
                        <span className="block text-2xl font-headline font-bold text-primary">12.4 TB</span>
                        <span className="text-xs text-on-surface-variant uppercase tracking-widest">Data Processed</span>
                    </div>
                    <div>
                        <span className="block text-2xl font-headline font-bold text-tertiary">99.9%</span>
                        <span className="text-xs text-on-surface-variant uppercase tracking-widest">Uptime Metric</span>
                    </div>
                </div>
            </div>
        </div>
      </section>
    </main>
  );
}
