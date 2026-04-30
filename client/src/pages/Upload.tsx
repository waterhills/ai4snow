import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { taskApi } from '../services/api';
import { useAuthStore } from '../stores/auth';

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    setError('');
    
    // Check points
    if (user && user.credits < 1) {
      setError('额度不足。请在个人控制面板中充值代币。');
      return;
    }

    // Typical video/image files
    if (!selectedFile.type.startsWith('video/') && !selectedFile.type.startsWith('image/')) {
      setError('格式无效。请上传视频或图像遥测数据。');
      return;
    }
    
    if (selectedFile.size > 100 * 1024 * 1024) {
      setError('文件过大。最大限制为 100MB。');
      return;
    }

    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError('');
    try {
      const res = await taskApi.upload(file, (percent) => setProgress(percent));
      navigate(`/results/${res.data.task.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || '摄取失败，请检查网络上行链路。');
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <main className="pt-32 pb-20 px-6 max-w-screen-2xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left Column: Upload Hub */}
      <div className="lg:col-span-8 space-y-12">
        <header className="space-y-4">
          <h1 className="font-headline text-5xl font-bold tracking-tight text-on-surface">
            数据 <span className="text-primary">上传</span>
          </h1>
          <p className="text-on-surface-variant max-w-xl text-lg leading-relaxed">
            上传您的滑雪视频，由我们的视觉分析引擎进行精准的姿态识别与动作评分。
          </p>
        </header>

        {error && (
          <div className="p-4 rounded-lg bg-error-container/20 border border-error/30 flex items-center gap-3">
            <span className="material-symbols-outlined text-error text-xl">warning</span>
            <p className="text-sm font-medium text-error uppercase tracking-wider">{error}</p>
          </div>
        )}

        <section className="relative group cursor-pointer" onClick={() => !uploading && fileInputRef.current?.click()}>
          <div 
            className={`glass-panel border-2 ${dragActive ? 'border-primary shadow-[0_0_30px_rgba(114,220,255,0.3)]' : 'border-outline-variant/30'} ${uploading ? 'opacity-80 pointer-events-none' : ''} rounded-xl overflow-hidden p-12 flex flex-col items-center justify-center min-h-[400px] hover:border-primary/50 transition-all duration-500`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {/* Scanning Visual Decor */}
            {!uploading && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity">
                <div className="scan-line"></div>
                {/* Corner Accents */}
                <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary/50"></div>
                <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-primary/50"></div>
                <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary/50"></div>
                <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-primary/50"></div>
                </div>
            )}

            <input 
              ref={fileInputRef}
              type="file" 
              className="hidden" 
              accept="video/*,image/*" 
              onChange={handleChange}
            />

            {!file ? (
                <div className="z-10 text-center space-y-6 pointer-events-none">
                <div className="w-24 h-24 bg-surface-container-high rounded-full flex items-center justify-center mx-auto border border-outline-variant/50 shadow-[0_0_30px_rgba(114,220,255,0.1)] group-hover:shadow-[0_0_40px_rgba(114,220,255,0.2)] transition-all">
                    <span className="material-symbols-outlined text-4xl text-primary">upload_file</span>
                </div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-headline font-semibold">在此处拖放视频</h3>
                    <p className="text-on-surface-variant font-mono text-sm">或浏览本地安全终端进行编码限制</p>
                </div>
                <button className="bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed px-8 py-3 rounded-xl font-bold tracking-tight hover:shadow-[0_0_20px_rgba(114,220,255,0.5)] transition-all pointer-events-auto">
                    选择数据源
                </button>
                </div>
            ) : (
                <div className="z-10 text-center space-y-6 flex flex-col items-center w-full max-w-md" onClick={e => e.stopPropagation()}>
                    <div className="w-24 h-24 bg-surface-container-high rounded-lg flex items-center justify-center mx-auto border border-primary/40 shadow-[0_0_30px_rgba(114,220,255,0.2)]">
                        {file.type.startsWith('video/') ? (
                           <span className="material-symbols-outlined text-4xl text-primary">movie</span>
                        ) : (
                           <span className="material-symbols-outlined text-4xl text-primary">image</span>
                        )}
                    </div>
                    
                    <div className="w-full">
                        <p className="text-on-surface font-bold truncate max-w-full text-lg mb-1">{file.name}</p>
                        <p className="text-on-surface-variant text-xs uppercase tracking-widest font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>

                    {uploading ? (
                        <div className="w-full text-left mt-6">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-primary text-xs uppercase tracking-widest font-bold">文件上传中</span>
                                <span className="text-on-surface font-mono text-sm">{progress}%</span>
                            </div>
                            <div className="h-2 w-full bg-surface-lowest rounded-full overflow-hidden border border-outline-variant/30">
                                <div 
                                    className="h-full bg-gradient-to-r from-primary to-tertiary transition-all duration-300" 
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-4 mt-6 w-full">
                            <button 
                                onClick={handleUpload}
                                className="flex-1 bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed py-3 rounded-xl font-bold active:scale-95 transition-transform flex items-center justify-center gap-2 btn-glow"
                            >
                                <span className="material-symbols-outlined text-lg">rocket_launch</span>
                                开始分析
                            </button>
                            <button 
                                onClick={() => setFile(null)}
                                className="px-6 bg-surface-variant border border-outline-variant/50 text-on-surface py-3 rounded-xl font-bold hover:bg-surface-container-high transition-colors active:scale-95"
                            >
                                中止
                            </button>
                        </div>
                    )}
                </div>
            )}
          </div>
        </section>

        <div className="flex flex-wrap gap-4 items-center justify-center lg:justify-start">
          <span className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">协议:</span>
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-surface-container text-primary text-xs font-mono rounded-lg border border-outline-variant/30">MP4_STREAM</span>
            <span className="px-3 py-1 bg-surface-container text-primary text-xs font-mono rounded-lg border border-outline-variant/30">MOV_PACKET</span>
            <span className="px-3 py-1 bg-surface-container text-primary text-xs font-mono rounded-lg border border-outline-variant/30">JPEG_STRUCT</span>
          </div>
        </div>
      </div>

      {/* Right side rules / info */}
      <aside className="lg:col-span-4 space-y-8">
        <div className="glass-panel border border-outline-variant/20 rounded-xl p-8 sticky top-28 space-y-8">
            <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center justify-between">
                系统指南
                <span className="text-[10px] bg-primary/20 text-primary px-2 py-1 rounded">系统日志</span>
            </h3>

            <div className="space-y-4">
                <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-primary mt-1 text-xl">monetization_on</span>
                    <div>
                        <h4 className="font-bold text-sm text-on-surface uppercase tracking-wide">代币消耗</h4>
                        <p className="text-xs text-on-surface-variant leading-relaxed">每次上传都会触发神经分析引擎，并在成功进入队列后扣除 1 个代币。</p>
                    </div>
                </div>
                <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-tertiary mt-1 text-xl">video_camera_front</span>
                    <div>
                        <h4 className="font-bold text-sm text-on-surface uppercase tracking-wide">视频优化</h4>
                        <p className="text-xs text-on-surface-variant leading-relaxed">限制视频长度在 100MB 以内。避免使用高压缩比格式以获得更好的追踪效果。</p>
                    </div>
                </div>
                <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-secondary mt-1 text-xl">speed</span>
                    <div>
                        <h4 className="font-bold text-sm text-on-surface uppercase tracking-wide">异步轮询</h4>
                        <p className="text-xs text-on-surface-variant leading-relaxed">在分析管道执行期间，您将被重定向到遥测历史控制台。</p>
                    </div>
                </div>
            </div>

            <div className="p-4 bg-tertiary-container/20 rounded-xl border border-tertiary/20">
                <p className="text-xs text-on-tertiary-container/80 leading-relaxed italic">
                    "精准是领奖台与摔倒之间的区别。请仔细校准。"
                </p>
            </div>
        </div>
      </aside>
    </main>
  );
}
