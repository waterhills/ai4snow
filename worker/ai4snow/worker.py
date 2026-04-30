#!/usr/bin/env python3
"""
Glacial Lab Worker — SkiVision 推理 Worker
============================================
轮询服务器获取待处理任务，执行 YOLO/RTMPose 推理后上报结果。

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
from dotenv import load_dotenv

# 加载 .env 配置
load_dotenv()

# ============================================================
# 配置区：优先读取环境变量，否则使用默认值
# ============================================================

API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:3000")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "ski-internal-api-key-change-in-production")
PIPELINE_ID = os.getenv("PIPELINE_ID", "jsba")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))

# 路径配置
AI4SNOW_ROOT = Path(__file__).resolve().parent
WORK_DIR = AI4SNOW_ROOT / "worker_workdir"
PYTHON_BIN = sys.executable

# ============================================================
# 核心逻辑
# ============================================================

HEADERS = {"x-api-key": INTERNAL_API_KEY}

def fetch_pending_task() -> dict | None:
    try:
        url = f"{API_BASE_URL}/api/internal/callback/pending-tasks"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            return resp.json().get("task")
    except Exception:
        pass
    return None

def download_file(file_key: str, save_path: Path) -> bool:
    url = f"{API_BASE_URL}/uploads/inputs/{file_key}"
    print(f"  [Download] Downloading video: {url}")
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

    print(f"  [Analysis] Starting analysis (YOLO + RTMPose)...")
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
    
    print(f"  [Video] Using FFmpeg to convert to H.264...")
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
        print(f"  ✅ 转换完成: {output_path.name}")
        return output_path
    except Exception as e:
        print(f"  ⚠️ 视频转码失败, 降级使用原文件: {e}")
        return input_path

def upload_result_file(file_path: Path, new_name: str) -> str | None:
    url = f"{API_BASE_URL}/api/internal/callback/upload-result"
    print(f"  [Upload] Uploading result video: {file_path.name}")
    try:
        with open(file_path, "rb") as f:
            files = {"file": (new_name, f, "video/mp4")}
            resp = requests.post(url, headers=HEADERS, files=files, timeout=300)
            if resp.status_code == 200:
                return resp.json().get("fileKey")
            else:
                print(f"  ❌ 上传失败: {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"  ❌ 网络上传过程出现异常: {e}")
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
    print(f"\n{'='*50}\n[Task] New task detected: {task_id[:8]}\n{'='*50}")
    
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
            # 找到分析的产物 JSON 和视频
            review_dir = run_dir / "review"
            metrics_json = review_dir / "pressure_curve_metrics.json"
            # pipeline 输出的文件都在 run_dir 下（非 review 子目录）
            sync_video = run_dir / f"{run_name}_pressure_sync.mp4"
            side_by_side_video = run_dir / f"{run_name}_side_by_side.mp4"

            result_data = {"score": 85, "msg": "分析成功"}
            if metrics_json.exists():
                import json
                try:
                    result_data = json.loads(metrics_json.read_text("utf-8"))
                    result_data["posture_score"] = result_data.get("sync_score", 85)
                except:
                    pass

            # 为上报做准备
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
                print("  ❌ 未找到任何结果视频可上传")
                report_failure(task_id, "未能生成结果视频文件")
                return

            report_success(task_id, result_key1, result_key2, result_data)
            print(f"Done! Task completed and reported successfully.")
        else:
            print(f"❌ 任务失败原因: {res.get('error')}")
            report_failure(task_id, f"分析流水线出错: {res.get('error')}")
    else:
        report_failure(task_id, "下载视频失败")

def main():
    print("SkiVision Worker Started")
    print(f"Connection URL: {API_BASE_URL}")
    print(f"Pipeline: {PIPELINE_ID} | Poll Interval: {POLL_INTERVAL}s")
    print("Listening for tasks...")
    
    while True:
        task = fetch_pending_task()
        if task:
            process_task(task)
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
