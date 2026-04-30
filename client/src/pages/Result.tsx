import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { taskApi } from '../services/api';

interface TaskListItem {
  id: string;
  status: string;
  inputFileKey: string;
  resultFileKey: string | null;
  createdAt: string;
  completedAt: string | null;
}

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
  resultFileUrl2: string | null;
}

const statusMap: Record<string, { label: string; colorClass: string; icon: string }> = {
  PENDING: { label: '待处理', colorClass: 'border-l-warning', icon: 'hourglass_empty' },
  PROCESSING: { label: '处理中', colorClass: 'border-l-secondary', icon: 'sync' },
  COMPLETED: { label: '已完成', colorClass: 'border-l-primary', icon: 'check_circle' },
  FAILED: { label: '失败', colorClass: 'border-l-error', icon: 'error' },
};

const formatShortDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return { month: months[d.getMonth()], day: d.getDate().toString().padStart(2, '0') };
};

// ===== 历史记录列表（无 id 时） =====
function TaskList() {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    taskApi.list(page, 10)
      .then((res) => { setTasks(res.data.tasks); setTotal(res.data.total); })
      .catch((err) => console.error('加载失败:', err))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / 10);

  const handleDelete = async (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要删除这条分析记录吗？')) return;
    try {
      await taskApi.delete(taskId);
      taskApi.list(page, 10)
        .then((res) => { setTasks(res.data.tasks); setTotal(res.data.total); })
        .catch(() => {});
    } catch (err) {
      console.error('删除失败:', err);
    }
  };

  return (
    <main className="pt-32 pb-20 px-6 max-w-4xl mx-auto min-h-screen">
      <div className="mb-10">
        <h1 className="text-5xl md:text-6xl font-headline font-bold tracking-tighter leading-none uppercase mb-4">分析 <span className="text-primary">结果</span></h1>
        <p className="text-on-surface-variant">查看您已处理的动力学序列。</p>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
          <span className="text-on-surface-variant uppercase tracking-widest text-xs">正在查询数据库...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-20 bg-surface-container-highest/20 rounded-xl border border-outline-variant/5 border-dashed">
          <span className="material-symbols-outlined text-6xl text-outline-variant mb-4">analytics</span>
          <h3 className="text-xl font-bold mb-2">未发现序列</h3>
          <p className="text-on-surface-variant text-sm mb-6 max-w-sm mx-auto">您尚未向冰川引擎上传任何视频。开始您的第一次分析以在此查看数据。</p>
          <Link to="/upload" className="px-6 py-3 border border-primary/40 text-primary font-bold rounded hover:bg-primary/5 transition-all text-sm uppercase tracking-widest">
            初始化上传
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => {
            const date = formatShortDate(task.createdAt);
            const statusInfo = statusMap[task.status] || { label: task.status, colorClass: 'border-l-outline-variant', icon: 'help' };
            const scoreLabel = task.status === 'COMPLETED' ? 'READY' : 'N/A';
            return (
              <Link to={`/results/${task.id}`} key={task.id} className={`block flex items-center justify-between p-4 bg-surface-container-low rounded-lg border-l-2 ${statusInfo.colorClass} group hover:bg-surface-container-high transition-colors`}>
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
                      状态: {statusInfo.label}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <span className="block text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">状态</span>
                    <span className={`font-headline font-bold text-lg ${task.status === 'COMPLETED' ? 'text-primary' : task.status === 'FAILED' ? 'text-error' : 'text-secondary'}`}>
                      {scoreLabel}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, task.id)}
                    className="w-10 h-10 rounded-full bg-surface-lowest flex items-center justify-center border border-outline-variant/20 hover:border-error/50 hover:bg-error/10 transition-colors"
                    title="删除记录"
                  >
                    <span className="material-symbols-outlined text-on-surface-variant hover:text-error transition-colors" style={{ fontSize: '20px' }}>delete</span>
                  </button>
                  <div className="w-10 h-10 rounded-full bg-surface-lowest flex items-center justify-center border border-outline-variant/20 group-hover:border-primary/50 transition-colors">
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">chevron_right</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-8 pt-4 border-t border-outline-variant/10">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-surface-container border border-outline-variant/30 rounded text-xs uppercase font-bold tracking-widest hover:bg-surface-variant disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            上一页
          </button>
          <span className="text-on-surface-variant text-sm font-mono">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-surface-container border border-outline-variant/30 rounded text-xs uppercase font-bold tracking-widest hover:bg-surface-variant disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </main>
  );
}

// ===== 单条任务详情（有 id 时） =====
function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const hasSyncVideo = !!task?.resultFileUrl;
  const hasSideVideo = !!task?.resultFileUrl2;
  const [viewMode, setViewMode] = useState<'sync' | 'side'>('sync');

  useEffect(() => {
    if (task?.status === 'COMPLETED' && !hasSyncVideo && hasSideVideo && viewMode === 'sync') {
      setViewMode('side');
    }
  }, [task?.status, hasSyncVideo, hasSideVideo]);

  useEffect(() => {
    if (!id) { setLoading(false); return; }

    let timer: number;
    let isMounted = true;

    const fetchStatus = async () => {
      try {
        const res = await taskApi.getStatus(id);
        if (isMounted) {
          if (res.data.status === 'COMPLETED') {
            const detailRes = await taskApi.get(id);
            setTask(detailRes.data);
            setLoading(false);
          } else if (res.data.status === 'FAILED') {
            setTask(res.data);
            setLoading(false);
          } else {
            setTask(res.data);
            timer = window.setTimeout(fetchStatus, 3000);
          }
        }
      } catch (err) {
        console.error('Failed to fetch status:', err);
        if (isMounted) setLoading(false);
      }
    };

    fetchStatus();
    return () => { isMounted = false; if (timer) window.clearTimeout(timer); };
  }, [id]);

  if (!task && !loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-background text-on-surface font-headline">
        <h2 className="text-xl tracking-widest text-error">未找到记录或系统错误。</h2>
      </div>
    );
  }

  if (task?.status === 'PENDING' || task?.status === 'PROCESSING' || loading) {
    return (
      <main className="pt-32 pb-20 px-6 max-w-4xl mx-auto min-h-screen flex flex-col justify-center items-center">
         <div className="w-full max-w-md bg-surface-container p-8 rounded-2xl border border-primary/20 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-surface-lowest">
               <div className="h-full bg-primary w-2/3 animate-[pulse_2s_ease-in-out_infinite]"></div>
            </div>
            <div className="text-center mb-8">
               <span className="material-symbols-outlined text-6xl text-primary mb-4 animate-spin" style={{ animationDuration: '4s' }}>radar</span>
               <h2 className="font-headline text-2xl font-bold uppercase tracking-widest text-on-surface">动作识别中</h2>
               <p className="text-on-surface-variant uppercase text-[10px] mt-2 font-mono">正在分析视频序列 {id?.slice(0,8)}...</p>
            </div>
            <div className="space-y-4">
               <div className="bg-surface-lowest p-4 rounded border border-outline-variant/10 flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">神经引擎</span>
                  <span className="text-primary font-mono text-xs animate-pulse">正在运行计算...</span>
               </div>
               <div className="bg-surface-lowest p-4 rounded border border-outline-variant/10 flex justify-between items-center opacity-50">
                  <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">空间对齐</span>
                  <span className="text-on-surface-variant font-mono text-xs">等待中...</span>
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
            <h2 className="font-headline text-2xl font-bold uppercase tracking-widest text-error mb-4">计算失败</h2>
            <p className="text-on-surface-variant text-sm mb-8">逻辑核心无法对上传的遥测数据进行排序。代币已退还。</p>
            <button onClick={() => navigate('/results')} className="px-8 py-3 bg-error text-on-error font-bold rounded uppercase tracking-widest hover:bg-error/80 transition-colors">返回结果列表</button>
         </div>
      </main>
    );
  }

  const score = task?.resultJson?.posture_score || 0;
  const currentVideoUrl = viewMode === 'sync' ? task?.resultFileUrl : task?.resultFileUrl2;
  const isVideo = !!currentVideoUrl && currentVideoUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i);

  return (
    <main className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
             <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] uppercase tracking-[0.2em] font-bold border border-primary/20">存档记录</span>
             <span className="text-on-surface-variant text-xs uppercase tracking-widest font-medium">会话 ID: {id?.slice(0,8).toUpperCase()}</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-headline font-bold tracking-tighter leading-none uppercase">分析 <span className="text-primary">结果</span></h1>
        </div>
        <button onClick={() => navigate('/results')} className="flex items-center gap-3 px-8 py-4 bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-bold rounded-xl active:scale-95 transition-all shadow-[0_0_20px_rgba(0,210,255,0.3)] hover:shadow-[0_0_30px_rgba(0,210,255,0.5)] uppercase tracking-wider text-sm">
           返回列表
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-8 group relative overflow-hidden rounded-xl bg-surface-container-low border border-outline-variant/15 p-8 transition-all flex flex-col justify-center items-center">
            <div className="absolute top-8 left-8 right-8 z-20 flex justify-between items-start pointer-events-none">
                <div className="bg-black/40 backdrop-blur px-4 py-2 rounded-lg border border-primary/20">
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-1">视觉矩阵</h3>
                    <p className="text-lg font-headline font-bold tracking-tight text-on-surface uppercase">
                        {viewMode === 'sync' ? '同步分析' : '并排对比'}
                    </p>
                </div>

                <div className="flex bg-black/40 backdrop-blur p-1 rounded-xl border border-outline-variant/20 pointer-events-auto">
                    <button
                        onClick={() => hasSyncVideo && setViewMode('sync')}
                        disabled={!hasSyncVideo}
                        className={`px-4 py-1.5 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all ${
                            viewMode === 'sync'
                                ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                                : hasSyncVideo
                                    ? 'text-on-surface-variant hover:text-on-surface cursor-pointer'
                                    : 'text-on-surface-variant/40 cursor-not-allowed'
                        }`}
                    >
                        同步视图
                    </button>
                    <button
                        onClick={() => hasSideVideo && setViewMode('side')}
                        disabled={!hasSideVideo}
                        className={`px-4 py-1.5 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all ${
                            viewMode === 'side'
                                ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                                : hasSideVideo
                                    ? 'text-on-surface-variant hover:text-on-surface cursor-pointer'
                                    : 'text-on-surface-variant/40 cursor-not-allowed'
                        }`}
                    >
                        并排视图
                    </button>
                </div>
            </div>

            <div className="mt-16 relative w-full rounded-2xl overflow-hidden glass-panel border border-outline-variant/30 flex justify-center items-center min-h-[400px]">
                {isVideo ? (
                    <video
                        key={viewMode}
                        src={currentVideoUrl!}
                        controls
                        autoPlay
                        muted
                        loop
                        className="w-full h-full object-contain max-h-[600px]"
                    />
                ) : (
                   task?.resultFileUrl ? (
                      <img src={task.resultFileUrl} alt="Result Visual" className="w-full h-full object-contain max-h-[600px] border border-primary/10" />
                   ) : (
                      <div className="text-outline-variant text-sm uppercase tracking-widest flex flex-col items-center">
                         <span className="material-symbols-outlined text-4xl mb-4">hide_image</span>
                         无视觉图层提供
                      </div>
                   )
                )}
            </div>
        </div>

        <div className="md:col-span-4 flex flex-col gap-6">
            <div className="bg-surface-container-high rounded-xl p-8 border border-outline-variant/15 flex-1 relative overflow-hidden">
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 blur-[80px] rounded-full"></div>
                <h3 className="text-xs uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-8">表现指数</h3>
                <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-8xl font-headline font-bold tracking-tighter text-glow text-primary">{score.toFixed(2)}</span>
                    <span className="text-2xl font-headline text-on-surface-variant">/100</span>
                </div>

                <p className="text-on-surface leading-relaxed text-sm mb-8 font-medium italic border-l-2 border-primary pl-4">
                   "{task?.resultJson?.feedback || '遥测数据记录成功。'}"
                </p>

                <div className="space-y-4">
                   <div className="flex justify-between items-center p-4 bg-surface-container-highest/50 rounded-lg border border-outline-variant/10">
                       <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-primary text-xl">speed</span>
                          <span className="text-xs uppercase tracking-widest font-bold text-on-surface">动力形态</span>
                       </div>
                       <span className="text-primary font-headline font-bold">{(score / 100 * 0.95).toFixed(2)}</span>
                   </div>
                   <div className="flex justify-between items-center p-4 bg-surface-container-highest/50 rounded-lg border border-outline-variant/10">
                       <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-tertiary text-xl">analytics</span>
                          <span className="text-xs uppercase tracking-widest font-bold text-on-surface">算法偏差</span>
                       </div>
                       <span className="text-tertiary font-headline font-bold">{score > 80 ? '最优' : '需校准'}</span>
                   </div>
                </div>
            </div>
        </div>

        {task?.resultJson?.details && (
            <div className="md:col-span-12">
               <div className="bg-surface-container-high/50 rounded-xl border border-outline-variant/15 overflow-hidden p-8">
                  <p className="text-xs uppercase tracking-[0.3em] font-bold text-primary mb-6">粒度数据详情</p>
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

// ===== 路由入口：有 id 显示详情，无 id 显示列表 =====
export default function Result() {
  const { id } = useParams<{ id: string }>();
  return id ? <TaskDetail /> : <TaskList />;
}
