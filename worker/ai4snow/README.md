# AI4Snow - 滑雪视频分析引擎

基于深度学习的高精度滑雪动作分析系统，支持 2D 骨架追踪和压力曲线分析。

## 核心技术

**检测与追踪流程：**
1. `YOLOv8x + ByteTrack` - 人物检测与追踪
2. `RTMPose-X` - 17 点关键点姿态估计
3. 时序修正 - 离线修正、EMA 融合、异常值处理
4. 自定义渲染 - 优化双腿重合场景显示

**为什么更稳定：**
- 先检测再裁剪，适合远景滑雪场景
- 追踪框提供时间连续性
- Anti-lag 修正抑制关键点拖尾
- Overlap-aware 渲染处理双腿重合

## 快速开始

### 1. 安装依赖

```bash
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. 配置环境变量

在 `worker/ai4snow/` 目录下创建 `.env` 文件：

```env
API_BASE_URL=http://127.0.0.1:3000
INTERNAL_API_KEY=ski-internal-api-key-change-in-production
PIPELINE_ID=jsba
POLL_INTERVAL=5
```

生产环境请修改为实际的 Server 地址和 API Key。

### 3. 启动 Worker

```bash
python worker.py
```

Worker 会持续轮询 Server 获取待处理任务，执行推理后自动上报结果。

### 4. 单独处理视频（调试用）

```bash
python run_ski_pipeline.py /path/to/your/video.mp4
python run_ski_pipeline.py /path/to/video.mp4 --name my_session --force
```

### 5. 查看结果

输出文件位于 `output/<任务名>/`：
- `<任务名>_overlay.mp4` - 骨架叠加视频
- `<任务名>_side_by_side.mp4` - 对比视频
- `<任务名>_pressure_sync.mp4` - 压力曲线同步视频
- `review/` - 分析报告和数据

## 环境变量说明

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `API_BASE_URL` | `http://127.0.0.1:3000` | Server 地址 |
| `INTERNAL_API_KEY` | `ski-internal-api-key-change-in-production` | 与 Server .env 一致 |
| `PIPELINE_ID` | `jsba` | 分析流水线模式 |
| `POLL_INTERVAL` | `5` | 轮询间隔（秒） |
