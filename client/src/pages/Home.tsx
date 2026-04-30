import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <main>
      {/* ===== Hero Section ===== */}
      <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            className="w-full h-full object-cover opacity-60 mix-blend-luminosity" 
            alt="Cinematic high-angle shot of a professional skier" 
            src="https://images.unsplash.com/photo-1551698618-1dfe5d97d256?q=80&w=2070&auto=format&fit=crop" 
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
        </div>
        
        <div className="relative z-10 w-full max-w-screen-2xl mx-auto px-8 lg:px-12">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-highest border border-primary/20 mb-8">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <span className="text-xs font-label uppercase tracking-widest text-primary">系统在线：视觉分析引擎</span>
            </div>
            
            <h1 className="font-headline text-5xl md:text-7xl font-bold text-on-surface tracking-tighter leading-[0.9] mb-8">
              精准高山<span className="text-primary italic">智能</span>：用数据掌控雪道
            </h1>
            
            <p className="text-on-surface-variant text-lg md:text-xl max-w-xl mb-12 font-light leading-relaxed">
              利用先进的计算机视觉与姿态检测技术，精准估计滑行压力并进行动作打分，为您提供科学的滑雪技术分析与改进建议。
            </p>
            
            <div className="flex flex-wrap gap-6">
              <Link to="/register" className="bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-bold px-10 py-5 rounded-xl text-lg uppercase tracking-wider neon-glow active:scale-95 transition-all">
                部署系统
              </Link>
              <a href="#features" className="glass-card border border-outline-variant/30 text-on-surface px-10 py-5 rounded-xl text-lg uppercase tracking-wider hover:bg-surface-variant transition-colors active:scale-95">
                查看技术规格
              </a>
            </div>
          </div>
        </div>

        {/* Floating Technical Plinth */}
        <div className="absolute bottom-12 right-8 hidden lg:block w-96">
          <div className="glass-card p-6 rounded-xl border border-primary/10">
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-[10px] font-label text-on-surface-variant uppercase tracking-widest">视觉识别</p>
                <h3 className="text-primary font-headline font-bold text-xl uppercase">姿态估计</h3>
              </div>
              <span className="text-primary-dim text-xs font-mono">智能分析中</span>
            </div>
            <div className="space-y-4">
              <div className="h-24 w-full bg-surface-container-lowest rounded overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent"></div>
                <div className="flex items-end justify-between h-full px-2 pb-1 gap-1">
                  <div className="w-2 bg-primary/40 h-[40%]"></div>
                  <div className="w-2 bg-primary/60 h-[65%]"></div>
                  <div className="w-2 bg-primary/80 h-[90%]"></div>
                  <div className="w-2 bg-primary h-[75%]"></div>
                  <div className="w-2 bg-tertiary h-[55%]"></div>
                  <div className="w-2 bg-tertiary/60 h-[30%]"></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-surface-container-high rounded border border-outline-variant/20">
                  <p className="text-[10px] text-on-surface-variant uppercase">边缘角度</p>
                  <p className="text-lg font-headline text-on-surface">42.5°</p>
                </div>
                <div className="p-3 bg-surface-container-high rounded border border-outline-variant/20">
                  <p className="text-[10px] text-on-surface-variant uppercase">压力值 PSI</p>
                  <p className="text-lg font-headline text-on-surface">1,240</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Features Grid ===== */}
      <section id="features" className="py-32 bg-background">
        <div className="max-w-screen-2xl mx-auto px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
            <div className="group">
              <div className="w-16 h-16 rounded-xl bg-surface-container-high flex items-center justify-center mb-8 border border-primary/10 group-hover:border-primary transition-colors">
                <span className="material-symbols-outlined text-primary text-3xl">grid_view</span>
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4 uppercase tracking-tight">基于视觉的压力估计</h3>
              <p className="text-on-surface-variant leading-relaxed">
                通过深度学习模型从视频中提取滑雪者的关键点，模拟并估计双脚压力分布，无需安装任何物理传感器。
              </p>
            </div>
            
            <div className="group">
              <div className="w-16 h-16 rounded-xl bg-surface-container-high flex items-center justify-center mb-8 border border-tertiary/10 group-hover:border-tertiary transition-colors">
                <span className="material-symbols-outlined text-tertiary text-3xl">psychology</span>
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4 uppercase tracking-tight">AI 动作质量评分</h3>
              <p className="text-on-surface-variant leading-relaxed">
                我们的神经网络能够实时识别滑雪动作，针对身体姿态、重心偏移和动作协调性进行多维度专业评分。
              </p>
            </div>
            
            <div className="group">
              <div className="w-16 h-16 rounded-xl bg-surface-container-high flex items-center justify-center mb-8 border border-secondary/10 group-hover:border-secondary transition-colors">
                <span className="material-symbols-outlined text-secondary text-3xl">cloud_sync</span>
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4 uppercase tracking-tight">云端同步表现追踪</h3>
              <p className="text-on-surface-variant leading-relaxed">
                在冰川实验室云端存档每次练习。通过多维度仪表盘和预测性技能预报，追踪整个雪季的进步。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== How it Works ===== */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-surface-container-low opacity-50"></div>
        <div className="max-w-screen-2xl mx-auto px-8 relative z-10">
          <div className="mb-24">
            <h2 className="font-headline text-4xl md:text-5xl font-bold tracking-tighter uppercase mb-4">工作原理</h2>
            <div className="h-1 w-24 bg-primary"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
            <div className="md:col-span-7 grid grid-cols-1 gap-8">
              <div className="flex gap-8 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-full border border-primary flex items-center justify-center text-primary font-headline font-bold text-xl">1</div>
                <div>
                  <h4 className="text-xl font-bold uppercase mb-2 group-hover:text-primary transition-colors">记录滑行</h4>
                  <p className="text-on-surface-variant">上传您的滑雪视频。我们的视觉模型会自动追踪滑雪者的姿态，并根据视频流解析动作特征。</p>
                </div>
              </div>
              <div className="flex gap-8 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-full border border-primary flex items-center justify-center text-primary font-headline font-bold text-xl">2</div>
                <div>
                  <h4 className="text-xl font-bold uppercase mb-2 group-hover:text-primary transition-colors">动能处理</h4>
                  <p className="text-on-surface-variant">冰川实验室智能引擎处理视觉数据，利用姿态估计技术还原滑行轨迹，并估算多维度的压力指标。</p>
                </div>
              </div>
              <div className="flex gap-8 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-full border border-primary flex items-center justify-center text-primary font-headline font-bold text-xl">3</div>
                <div>
                  <h4 className="text-xl font-bold uppercase mb-2 group-hover:text-primary transition-colors">分析与改进</h4>
                  <p className="text-on-surface-variant">通过多维度的动作评分报告和压力分布估计，直观展示您的滑行细节，助您精准改进技术缺陷。</p>
                </div>
              </div>
            </div>
            
            <div className="md:col-span-5">
              <div className="relative aspect-square rounded-2xl overflow-hidden border border-outline-variant/30 glass-card p-4">
                <img 
                  className="w-full h-full object-cover rounded-xl opacity-80 shadow-2xl" 
                  alt="Professional snowboarder with digital pose and pressure analysis overlay" 
                  src="/assets/images/snowboard_analysis.png" 
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-tertiary/10 pointer-events-none"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing section has been migrated to the standalone Pricing dashboard */}

    </main>
  );
}
