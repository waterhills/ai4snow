import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { taskApi } from '../services/api';

interface TaskDetail {
  id: string;
  status: string;
  resultJson: {
    posture_score?: number;
    feedback?: string;
    details?: string;
  } | null;
  inputFileUrl: string;
  resultFileUrl: string | null;
}

export default function Result() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // 轮询机制
  useEffect(() => {
    if (!id) {
       setLoading(false);
       return;
    }
    
    let timer: number;
    let isMounted = true;

    const fetchStatus = async () => {
      try {
        const res = await taskApi.getStatus(id);
        if (isMounted) {
          setTask(res.data);
          // 如果任务在进行中，继续轮询
          if (res.data.status === 'PENDING' || res.data.status === 'PROCESSING') {
            timer = window.setTimeout(fetchStatus, 3000);
          } else {
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Failed to fetch status:', err);
        if (isMounted) setLoading(false);
      }
    };

    fetchStatus();

    return () => {
      isMounted = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [id]);

  if (!id) {
     return (
        <main className="pt-32 pb-20 px-6 max-w-4xl mx-auto min-h-screen flex flex-col items-center">
            <div className="text-center py-32 w-full glass-panel border border-outline-variant/20 rounded-2xl">
               <span className="material-symbols-outlined text-6xl text-outline-variant mb-6" style={{ fontVariationSettings: "'FILL' 0" }}>target</span>
               <h2 className="font-headline text-3xl font-bold uppercase tracking-widest text-on-surface mb-4">No Sequence Selected</h2>
               <p className="text-on-surface-variant max-w-md mx-auto mb-8">Deployments and telemetry are accessible via your operative profile. Please select a specific Sequence record to view the analytical matrices.</p>
               <Link to="/pricing" className="px-8 py-3 bg-gradient-to-r from-primary/80 to-primary-container text-on-primary-fixed rounded-lg font-bold uppercase tracking-widest hover:brightness-110 transition-all">
                  Access History Array
               </Link>
            </div>
        </main>
     );
  }

  if (!task && !loading) {
     return (
        <div className="flex justify-center items-center h-screen bg-background text-on-surface font-headline">
           <h2 className="text-xl tracking-widest text-error">Record Not Found or System Error.</h2>
        </div>
     );
  }

  // --- RENDERING BASED ON STATUS --- //
  if (task?.status === 'PENDING' || task?.status === 'PROCESSING' || loading) {
    return (
      <main className="pt-32 pb-20 px-6 max-w-4xl mx-auto min-h-screen flex flex-col justify-center items-center">
         <div className="w-full max-w-md bg-surface-container p-8 rounded-2xl border border-primary/20 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-surface-lowest">
               <div className="h-full bg-primary w-2/3 animate-[pulse_2s_ease-in-out_infinite]"></div>
            </div>
            
            <div className="text-center mb-8">
               <span className="material-symbols-outlined text-6xl text-primary mb-4 animate-spin" style={{ animationDuration: '4s' }}>radar</span>
               <h2 className="font-headline text-2xl font-bold uppercase tracking-widest text-on-surface">Kinematics Engaged</h2>
               <p className="text-on-surface-variant uppercase text-[10px] mt-2 font-mono">Parsing telemetry sequence {id?.slice(0,8)}...</p>
            </div>

            <div className="space-y-4">
               <div className="bg-surface-lowest p-4 rounded border border-outline-variant/10 flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Neural Engine</span>
                  <span className="text-primary font-mono text-xs animate-pulse">Running Compute...</span>
               </div>
               <div className="bg-surface-lowest p-4 rounded border border-outline-variant/10 flex justify-between items-center opacity-50">
                  <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Spatial Align</span>
                  <span className="text-on-surface-variant font-mono text-xs">Waiting...</span>
               </div>
            </div>
         </div>
      </main>
    );
  }

  if (task?.status === 'FAILED') {
     return (
        <main className="pt-32 pb-20 px-6 max-w-4xl mx-auto min-h-screen flex flex-col justify-center items-center">
           <div className="w-full max-w-md bg-error-container/10 p-8 rounded-2xl border border-error/30 text-center">
              <span className="material-symbols-outlined text-6xl text-error mb-4">cancel</span>
              <h2 className="font-headline text-2xl font-bold uppercase tracking-widest text-error mb-4">Compute Failure</h2>
              <p className="text-on-surface-variant text-sm mb-8">The logic core failed to sequence the uploaded telemetry. Token refunded.</p>
              <Link to="/pricing" className="px-8 py-3 bg-error text-on-error font-bold rounded uppercase tracking-widest hover:bg-error/80 transition-colors">Return to Base</Link>
           </div>
        </main>
     );
  }

  // --- SUCCESS STATE: RENDERING RESULTS LAYER --- //
  const score = task?.resultJson?.posture_score || 0;
  const isVideo = task?.resultFileUrl && task.resultFileUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i);

  return (
    <main className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
             <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] uppercase tracking-[0.2em] font-bold border border-primary/20">Archived Record</span>
             <span className="text-on-surface-variant text-xs uppercase tracking-widest font-medium">Session ID: {id?.slice(0,8).toUpperCase()}</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-headline font-bold tracking-tighter leading-none uppercase">ANALYSIS <span className="text-primary">RESULTS</span></h1>
        </div>
        <Link to="/pricing" className="flex items-center gap-3 px-8 py-4 bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-bold rounded-xl active:scale-95 transition-all shadow-[0_0_20px_rgba(0,210,255,0.3)] hover:shadow-[0_0_30px_rgba(0,210,255,0.5)] uppercase tracking-wider text-sm">
           Return Array
        </Link>
      </header>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Visual Map */}
        <div className="md:col-span-8 group relative overflow-hidden rounded-xl bg-surface-container-low border border-outline-variant/15 p-8 transition-all flex flex-col justify-center items-center">
            <div className="absolute top-8 left-8 z-10 bg-black/40 backdrop-blur px-4 py-2 rounded-lg border border-primary/20">
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-1">Visual Matrix</h3>
                <p className="text-lg font-headline font-bold tracking-tight text-on-surface uppercase">Render Output</p>
            </div>
            
            <div className="mt-10 lg:mt-0 relative w-full rounded-2xl overflow-hidden glass-panel border border-outline-variant/30 flex justify-center items-center min-h-[400px]">
                {isVideo ? (
                    <video src={task?.resultFileUrl!} controls autoPlay loop className="w-full h-full object-contain max-h-[600px]" />
                ) : (
                   task?.resultFileUrl ? (
                      <img src={task.resultFileUrl} alt="Result Visual" className="w-full h-full object-contain max-h-[600px] border border-primary/10" />
                   ) : (
                      <div className="text-outline-variant text-sm uppercase tracking-widest flex flex-col items-center">
                         <span className="material-symbols-outlined text-4xl mb-4">hide_image</span>
                         No Visual Layer Provided
                      </div>
                   )
                )}
            </div>
        </div>

        {/* Scoring */}
        <div className="md:col-span-4 flex flex-col gap-6">
            <div className="bg-surface-container-high rounded-xl p-8 border border-outline-variant/15 flex-1 relative overflow-hidden">
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 blur-[80px] rounded-full"></div>
                <h3 className="text-xs uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-8">Performance Index</h3>
                <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-8xl font-headline font-bold tracking-tighter text-glow text-primary">{score}</span>
                    <span className="text-2xl font-headline text-on-surface-variant">/100</span>
                </div>
                
                <p className="text-on-surface leading-relaxed text-sm mb-8 font-medium italic border-l-2 border-primary pl-4">
                   "{task?.resultJson?.feedback || 'Telemetry recorded successfully.'}"
                </p>
                
                <div className="space-y-4">
                   <div className="flex justify-between items-center p-4 bg-surface-container-highest/50 rounded-lg border border-outline-variant/10">
                       <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-primary text-xl">speed</span>
                          <span className="text-xs uppercase tracking-widest font-bold text-on-surface">Kinetic Form</span>
                       </div>
                       <span className="text-primary font-headline font-bold">{(score / 100 * 0.95).toFixed(2)}</span>
                   </div>
                   <div className="flex justify-between items-center p-4 bg-surface-container-highest/50 rounded-lg border border-outline-variant/10">
                       <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-tertiary text-xl">analytics</span>
                          <span className="text-xs uppercase tracking-widest font-bold text-on-surface">Algorithmic Shift</span>
                       </div>
                       <span className="text-tertiary font-headline font-bold">{score > 80 ? 'Optimal' : 'Needs Calib.'}</span>
                   </div>
                </div>
            </div>
        </div>

        {/* Extra Json Data rendering as mock log */}
        {task?.resultJson?.details && (
            <div className="md:col-span-12">
               <div className="bg-surface-container-high/50 rounded-xl border border-outline-variant/15 overflow-hidden p-8">
                  <p className="text-xs uppercase tracking-[0.3em] font-bold text-primary mb-6">Granular Data Details</p>
                  <p className="text-on-surface-variant font-mono text-sm leading-relaxed">
                     {task.resultJson.details}
                  </p>
               </div>
            </div>
        )}
      </div>
    </main>
  );
}
