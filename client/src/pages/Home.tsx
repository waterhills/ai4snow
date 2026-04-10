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
              <span className="text-xs font-label uppercase tracking-widest text-primary">System Online: Live Telemetry</span>
            </div>
            
            <h1 className="font-headline text-5xl md:text-7xl font-bold text-on-surface tracking-tighter leading-[0.9] mb-8">
              Precision Alpine <span className="text-primary italic">Intelligence</span>: Master the Slopes with Data.
            </h1>
            
            <p className="text-on-surface-variant text-lg md:text-xl max-w-xl mb-12 font-light leading-relaxed">
              Harness laboratory-grade pressure mapping to optimize every turn. Our AI decodes your kinetic signature in real-time, delivering professional coaching for elite performance.
            </p>
            
            <div className="flex flex-wrap gap-6">
              <Link to="/register" className="bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-bold px-10 py-5 rounded-xl text-lg uppercase tracking-wider neon-glow active:scale-95 transition-all">
                Deploy System
              </Link>
              <a href="#features" className="glass-card border border-outline-variant/30 text-on-surface px-10 py-5 rounded-xl text-lg uppercase tracking-wider hover:bg-surface-variant transition-colors active:scale-95">
                View Tech Specs
              </a>
            </div>
          </div>
        </div>

        {/* Floating Technical Plinth */}
        <div className="absolute bottom-12 right-8 hidden lg:block w-96">
          <div className="glass-card p-6 rounded-xl border border-primary/10">
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-[10px] font-label text-on-surface-variant uppercase tracking-widest">Active Sensor</p>
                <h3 className="text-primary font-headline font-bold text-xl uppercase">Pressure Map L1</h3>
              </div>
              <span className="text-primary-dim text-xs font-mono">0.02ms Latency</span>
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
                  <p className="text-[10px] text-on-surface-variant uppercase">Edge Angle</p>
                  <p className="text-lg font-headline text-on-surface">42.5°</p>
                </div>
                <div className="p-3 bg-surface-container-high rounded border border-outline-variant/20">
                  <p className="text-[10px] text-on-surface-variant uppercase">Force PSI</p>
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
              <h3 className="font-headline text-2xl font-bold mb-4 uppercase tracking-tight">Real-time Pressure Mapping</h3>
              <p className="text-on-surface-variant leading-relaxed">
                High-density sensor integration across your boot liner captures 1,000 data points per second, visualizing the exact distribution of your kinetic energy.
              </p>
            </div>
            
            <div className="group">
              <div className="w-16 h-16 rounded-xl bg-surface-container-high flex items-center justify-center mb-8 border border-tertiary/10 group-hover:border-tertiary transition-colors">
                <span className="material-symbols-outlined text-tertiary text-3xl">psychology</span>
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4 uppercase tracking-tight">AI-Driven Technique Analysis</h3>
              <p className="text-on-surface-variant leading-relaxed">
                Our neural networks compare your data against elite alpine racers, providing instant corrections for weight distribution, edging, and transition timing.
              </p>
            </div>
            
            <div className="group">
              <div className="w-16 h-16 rounded-xl bg-surface-container-high flex items-center justify-center mb-8 border border-secondary/10 group-hover:border-secondary transition-colors">
                <span className="material-symbols-outlined text-secondary text-3xl">cloud_sync</span>
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4 uppercase tracking-tight">Cloud-Sync Performance Tracking</h3>
              <p className="text-on-surface-variant leading-relaxed">
                Archive every session in the Glacial Lab cloud. Track season-long progress with multi-metric dashboards and predictive skill forecasting.
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
            <h2 className="font-headline text-4xl md:text-5xl font-bold tracking-tighter uppercase mb-4">How it Works</h2>
            <div className="h-1 w-24 bg-primary"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
            <div className="md:col-span-7 grid grid-cols-1 gap-8">
              <div className="flex gap-8 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-full border border-primary flex items-center justify-center text-primary font-headline font-bold text-xl">1</div>
                <div>
                  <h4 className="text-xl font-bold uppercase mb-2 group-hover:text-primary transition-colors">Capture Descent</h4>
                  <p className="text-on-surface-variant">Upload your standard video file. Sensors and vision models record spatial orientation and multi-point pressure data during every carve.</p>
                </div>
              </div>
              <div className="flex gap-8 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-full border border-primary flex items-center justify-center text-primary font-headline font-bold text-xl">2</div>
                <div>
                  <h4 className="text-xl font-bold uppercase mb-2 group-hover:text-primary transition-colors">Kinetic Processing</h4>
                  <p className="text-on-surface-variant">The Glacial Lab intelligence engine processes the telemetry, applying real-time posture grids and parsing 4.2k pressure nodes/sec.</p>
                </div>
              </div>
              <div className="flex gap-8 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-full border border-primary flex items-center justify-center text-primary font-headline font-bold text-xl">3</div>
                <div>
                  <h4 className="text-xl font-bold uppercase mb-2 group-hover:text-primary transition-colors">Analyze & Improve</h4>
                  <p className="text-on-surface-variant">Review a complete 3D replay of your performance with heatmap overlays and AI-generated drills to target your specific weaknesses.</p>
                </div>
              </div>
            </div>
            
            <div className="md:col-span-5">
              <div className="relative aspect-square rounded-2xl overflow-hidden border border-outline-variant/30 glass-card p-4">
                <img 
                  className="w-full h-full object-cover rounded-xl opacity-80 shadow-2xl" 
                  alt="A top-down view of a digital ski boot schematic" 
                  src="https://images.unsplash.com/photo-1605548230624-8d2d0419c517?q=80&w=2070&auto=format&fit=crop" 
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
