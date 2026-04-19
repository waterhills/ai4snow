#!/usr/bin/env python3
"""
Glacial Lab Worker — SkiVision 推理 Worker
============================================
通过 Redis 队列即时获取任务，无 Redis 时自动回退到 HTTP 轮询。
执行 YOLO/RTMPose 推理后通过 HTTP 回调上报结果。

配置方式：通过环境变量或 .env 文件设置（优先使用 python-dotenv）。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

# 加载 .env 文件（如果存在）
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ============================================================
# 配置区：优先读取环境变量，否则使用默认值
# ============================================================

API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:3000")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "ski-internal-api-key-change-in-production")
PIPELINE_ID = os.getenv("PIPELINE_ID", "jsba")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))

# Redis 配置（留空则回退到 HTTP 轮询）
REDIS_URL = os.getenv("REDIS_URL", "")
REDIS_QUEUE_KEY = "ski:tasks"
MAX_REDIS_ERRORS = 10

# 路径配置
AI4SNOW_ROOT = Path(__file__).resolve().parent
WORK_DIR = AI4SNOW_ROOT / "worker_workdir"
PYTHON_BIN = sys.executable

# ============================================================
# 任务获取：Redis BRPOP（优先） / HTTP 轮询（回退）
# ============================================================

HEADERS = {"x-api-key": INTERNAL_API_KEY}


def create_redis_client():
    """创建 Redis 客户端，失败返回 None"""
    if not REDIS_URL:
        return None
    try:
        import redis
        client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        client.ping()
        return client
    except Exception as e:
        print(f"Redis 连接失败 ({e})，回退到 HTTP 轮询模式")
        return None


def fetch_task_from_redis(redis_client) -> dict | None:
    """通过 Redis BRPOP 阻塞获取任务，超时返回 None"""
    try:
        result = redis_client.brpop(REDIS_QUEUE_KEY, timeout=POLL_INTERVAL)
        if result is None:
            return None
        _, raw_message = result
        task_message = json.loads(raw_message)
        # 标准化：Redis 消息用 "taskId"，process_task 期望 "id"
        return {
            "id": task_message["taskId"],
            "inputFileKey": task_message["inputFileKey"],
            "source": "redis",
        }
    except json.JSONDecodeError as e:
        print(f"Redis 消息 JSON 解析失败: {e}")
        return None
    except Exception as e:
        print(f"Redis BRPOP 异常: {e}")
        return None


def fetch_pending_task() -> dict | None:
    """HTTP 轮询：从服务器获取待处理任务"""
    try:
        url = f"{API_BASE_URL}/api/internal/callback/pending-tasks"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            return resp.json().get("task")
    except Exception:
        pass
    return None


# ============================================================
# 任务处理：下载 → 推理 → 上传 → 上报
# ============================================================

def download_file(file_key: str, save_path: Path) -> bool:
    url = f"{API_BASE_URL}/uploads/inputs/{file_key}"
    print(f"  正在下载视频: {url}")
    try:
        resp = requests.get(url, stream=True, timeout=60)
        if resp.status_code != 200: return False
        with open(save_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=65536):
                f.write(chunk)
        return True
    except Exception:
        return False

def run_pipeline(input_video: Path, run_name: str, output_root: Path) -> dict:
    pipeline_script = AI4SNOW_ROOT / "run_ski_pipeline.py"
    if not pipeline_script.exists():
        return {"success": False, "error": "找不到 run_ski_pipeline.py"}

    cmd = [
        PYTHON_BIN, "-u",
        str(pipeline_script),
        str(input_video),
        "--name", run_name,
        "--output-root", str(output_root),
        "--pipeline-id", PIPELINE_ID,
    ]

    print(f"  启动分析 (YOLO + RTMPose)...")
    log_content = ""
    try:
        process = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, cwd=str(AI4SNOW_ROOT),
            encoding="utf-8", errors="replace"
        )
        for line in process.stdout:
            print(f"    | {line.strip()}")
            log_content += line
        process.wait()

        # 将日志保存到工作目录备查
        (output_root / "run.log").write_text(log_content, encoding="utf-8")

        if process.returncode == 0:
            return {"success": True}
        else:
            return {"success": False, "error": f"退出码 {process.returncode}"}
    except Exception as e:
        return {"success": False, "error": f"运行异常: {str(e)}"}

def recode_to_h264(input_path: Path) -> Path:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    output_path = input_path.with_name(f"{input_path.stem}_h264{input_path.suffix}")

    print(f"  正在使用 FFmpeg 转换为 H.264 格式以兼容浏览器播放...")
    cmd = [
        ffmpeg_exe, "-y",
        "-i", str(input_path),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "copy",
        str(output_path)
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"  转换完成: {output_path.name}")
        return output_path
    except Exception as e:
        print(f"  视频转码失败, 降级使用原文件: {e}")
        return input_path

def upload_result_file(file_path: Path, new_name: str) -> str | None:
    url = f"{API_BASE_URL}/api/internal/callback/upload-result"
    print(f"  正在推送结果视频: {file_path.name}")
    try:
        with open(file_path, "rb") as f:
            files = {"file": (new_name, f, "video/mp4")}
            resp = requests.post(url, headers=HEADERS, files=files, timeout=300)
            if resp.status_code == 200:
                return resp.json().get("fileKey")
            else:
                print(f"  上传失败: {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"  上传异常: {e}")
    return None

def report_success(task_id: str, result_file_key: str, result_file_key2: str | None, result_json: dict):
    url = f"{API_BASE_URL}/api/internal/callback/task-complete"
    payload = {
        "taskId": task_id,
        "resultFileKey": result_file_key,
        "resultFileKey2": result_file_key2,
        "resultJson": result_json
    }
    try:
        requests.post(url, headers=HEADERS, json=payload, timeout=10)
    except Exception: pass

def report_failure(task_id: str, error_msg: str):
    url = f"{API_BASE_URL}/api/internal/callback/task-failed"
    try:
        requests.post(url, headers=HEADERS, json={"taskId": task_id, "errorMsg": error_msg}, timeout=10)
    except Exception: pass

def process_task(task: dict):
    task_id = task["id"]
    file_key = task["inputFileKey"]
    source = task.get("source", "http")
    print(f"\n{'='*50}")
    print(f"监听到新任务: {task_id[:8]} (来源: {source})")
    print(f"{'='*50}")

    WORK_DIR.mkdir(parents=True, exist_ok=True)
    task_work_dir = WORK_DIR / task_id[:8]
    task_work_dir.mkdir(parents=True, exist_ok=True)

    input_video = task_work_dir / file_key
    if download_file(file_key, input_video):
        output_root = task_work_dir / "output"
        res = run_pipeline(input_video, Path(file_key).stem, output_root)
        if res["success"]:
            run_name = Path(file_key).stem
            run_dir = output_root / run_name
            review_dir = run_dir / "review"
            metrics_json = review_dir / "pressure_curve_metrics.json"
            sync_video = run_dir / f"{run_name}_pressure_sync.mp4"
            side_by_side_video = run_dir / f"{run_name}_side_by_side.mp4"

            result_data = {"score": 85, "msg": "分析成功"}
            if metrics_json.exists():
                try:
                    result_data = json.loads(metrics_json.read_text("utf-8"))
                    result_data["posture_score"] = result_data.get("sync_score", 85)
                except:
                    pass

            result_key1 = None
            result_key2 = None

            # 1. 优先处理：全功能同步分析视频 (Primary)
            if sync_video.exists():
                h264_1 = recode_to_h264(sync_video)
                result_key1 = upload_result_file(h264_1, f"result_sync_{file_key}")

            # 2. 次要处理：双窗对比视频 (Secondary)
            if side_by_side_video.exists():
                h264_2 = recode_to_h264(side_by_side_video)
                result_key2 = upload_result_file(h264_2, f"result_side_{file_key}")

            # 兜底：如果没找到同步视频，尝试把双窗对比提升为主视频
            if not result_key1 and result_key2:
                result_key1 = result_key2
                result_key2 = None

            if not result_key1:
                print("  未找到任何结果视频可上传")
                report_failure(task_id, "未能生成结果视频文件")
                return

            report_success(task_id, result_key1, result_key2, result_data)
            print(f"任务完成！已成功上报双路视频数据")
        else:
            print(f"任务失败: {res.get('error')}")
            report_failure(task_id, f"分析流水线出错: {res.get('error')}")
    else:
        report_failure(task_id, "下载视频失败")


# ============================================================
# 主循环
# ============================================================

def main():
    print("SkiVision Worker 已启动")
    print(f"  连接地址: {API_BASE_URL}")
    print(f"  流水线: {PIPELINE_ID}")

    redis_client = create_redis_client()
    use_redis = redis_client is not None

    if use_redis:
        print(f"  模式: Redis 即时推送 (队列: {REDIS_QUEUE_KEY})")
    else:
        print(f"  模式: HTTP 轮询 (间隔: {POLL_INTERVAL}s)")

    print("正在等待任务...")

    consecutive_errors = 0

    try:
        while True:
            if use_redis:
                task = fetch_task_from_redis(redis_client)
                if task:
                    consecutive_errors = 0
                    process_task(task)
                else:
                    pass  # BRPOP 超时，继续循环
                # 连续错误过多则降级到 HTTP 轮询
                if consecutive_errors >= MAX_REDIS_ERRORS:
                    print(f"Redis 连续错误 {MAX_REDIS_ERRORS} 次，切换到 HTTP 轮询模式")
                    redis_client = None
                    use_redis = False
            else:
                task = fetch_pending_task()
                if task:
                    task["source"] = "http"
                    process_task(task)
                time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        print("\nWorker 正在停止...")
        if redis_client:
            redis_client.close()
        print("Worker 已停止")

if __name__ == "__main__":
    main()
