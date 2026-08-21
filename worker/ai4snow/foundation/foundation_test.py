#!/usr/bin/env python3
"""Stable manual test entry point for the current AI4Snow Foundation."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TRACKER_SCRIPT = PROJECT_ROOT / 'video_keypoint_tracker.py'
SPARSE_TRACKER_SCRIPT = Path(__file__).resolve().parent / 'sparse_foundation.py'
DEFAULT_OUTPUT_ROOT = PROJECT_ROOT / 'output' / 'foundation'


def sanitize_name(name: str) -> str:
    safe = re.sub(r'[^0-9A-Za-z._-]+', '_', name.strip())
    safe = safe.strip('._-')
    return safe or 'foundation_test'


def nonnegative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError('must be zero or greater')
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description='Run Detection, Tracking, Pose, Temporal, Render, and optional profiling only.'
    )
    parser.add_argument('--video', required=True, help='Input video path, relative to worker/ai4snow or absolute.')
    parser.add_argument(
        '--foundation-strategy',
        choices=('legacy', 'sparse_v1'),
        default='legacy',
        help='Foundation implementation. The default remains legacy.',
    )
    parser.add_argument('--name', default='', help='Test name; defaults to the input video stem.')
    parser.add_argument(
        '--output-root',
        default=str(DEFAULT_OUTPUT_ROOT),
        help='Output root; relative paths are resolved from worker/ai4snow.',
    )
    parser.add_argument('--max-frames', type=nonnegative_int, default=0, help='Frame cap; zero processes the full video.')
    parser.add_argument(
        '--max-analysis-frames',
        type=nonnegative_int,
        default=0,
        help='Sparse-only analysis-frame cap; zero processes the full video.',
    )
    parser.add_argument('--analysis-fps', type=float, default=30.0, help='Sparse analysis FPS ceiling.')
    parser.add_argument(
        '--max-pose-calls-per-analysis-frame',
        type=int,
        default=4,
        help='Hard Sparse pose-call budget per analysis frame.',
    )
    parser.add_argument(
        '--round',
        default='',
        help="Foundation2 round number, or 'next' for the next output/roundN (new).",
    )
    parser.add_argument('--profile', action='store_true', help='Enable the existing tracker performance profiler.')
    parser.add_argument('--force', action='store_true', help='Overwrite the named test outputs and rebuild caches.')
    return parser


def find_next_new_round(output_root: Path | None = None) -> Path:
    root = (PROJECT_ROOT / 'output') if output_root is None else Path(output_root)
    round_number = 1
    while (root / f'round{round_number} (new)').exists():
        round_number += 1
    return root / f'round{round_number} (new)'


def resolve_round_output(round_value: str, strategy: str) -> Path | None:
    value = round_value.strip().lower()
    if not value:
        return None
    if value == 'next':
        round_root = find_next_new_round()
    else:
        round_number = int(value)
        if round_number < 1:
            raise ValueError('--round must be a positive integer or next')
        round_root = PROJECT_ROOT / 'output' / f'round{round_number} (new)'
    arm = 'baseline' if strategy == 'legacy' else 'sparse_v1'
    return round_root / arm


def resolve_video(path_value: str) -> Path:
    path = Path(path_value).expanduser()
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path.resolve()


def probe_video(path: Path) -> dict[str, float | int]:
    import cv2

    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise RuntimeError(f'无法打开视频: {path}')
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    finally:
        capture.release()
    return {
        'fps': fps,
        'frame_count': frame_count,
        'duration_s': float(frame_count / fps) if fps > 0.0 else 0.0,
    }


def load_profile(path: Path) -> dict[str, Any]:
    with path.open('r', encoding='utf-8') as profile_file:
        profile = json.load(profile_file)
    if not isinstance(profile, dict):
        raise ValueError(f'性能报告格式无效: {path}')
    return profile


def format_count(value: Any) -> str:
    return 'N/A' if value is None else str(int(value))


def format_seconds(value: Any) -> str:
    return 'N/A' if value is None else f'{float(value):.3f} s'


def print_summary(
    *,
    video_path: Path,
    video_info: dict[str, float | int] | None,
    profile: dict[str, Any] | None,
    wall_total_s: float,
    output_path: Path,
    status: str,
    strategy: str,
) -> None:
    tracking = profile.get('tracking', {}) if profile else {}
    pose = profile.get('pose', {}) if profile else {}
    temporal = (profile.get('postprocess') or profile.get('temporal') or {}) if profile else {}
    render = profile.get('render', {}) if profile else {}
    tracker = profile.get('tracker', {}) if profile else {}

    frames = video_info.get('frame_count') if video_info else None
    duration = video_info.get('duration_s') if video_info else None

    print('\n===== AI4Snow Foundation Test =====\n')
    print(f'Strategy: {strategy}')
    print(f'Video: {video_path}')
    print(f'Frames: {format_count(frames)}')
    print(f'Duration: {format_seconds(duration)}')
    print('\nDetection:')
    print(f"Tracked frames: {format_count(tracking.get('found_frames'))}")
    print(f"Lost frames: {format_count(tracking.get('lost_frames'))}")
    print('\nPose:')
    print(f"Pose frames: {format_count(pose.get('pose_frames_processed'))}")
    print(f"RTMPose calls: {format_count(pose.get('rtmpose_calls'))}")
    calls_per_frame = pose.get('rtmpose_calls_per_frame')
    if calls_per_frame is None:
        calls_per_frame = pose.get('rtmpose_calls_per_analysis_frame')
    print(f"RTMPose calls/frame: {'N/A' if calls_per_frame is None else f'{float(calls_per_frame):.3f}'}")
    if strategy == 'sparse_v1':
        print(f"YOLO calls: {format_count(tracking.get('yolo_calls'))}")
        print(f"Primary accepts: {format_count(pose.get('primary_pose_accepts'))}")
        print(f"Rescue frames: {format_count(pose.get('pose_rescue_frames'))}")
    print('\nRuntime:')
    print(f"Tracking: {format_seconds(tracking.get('total_s'))}")
    print(f"Pose: {format_seconds(pose.get('total_s'))}")
    print(f"Temporal: {format_seconds(temporal.get('total_s'))}")
    print(f"Render: {format_seconds(render.get('total_s'))}")
    print(f"Total: {format_seconds(tracker.get('total_s', wall_total_s))}")
    print('\nOutput:')
    print(output_path)
    print(f'\nSTATUS: {status}')


def main() -> int:
    args = build_parser().parse_args()
    video_path = resolve_video(args.video)
    run_name = sanitize_name(args.name) if args.name.strip() else sanitize_name(video_path.stem)
    round_output = resolve_round_output(args.round, args.foundation_strategy)
    output_root = round_output if round_output is not None else Path(args.output_root).expanduser()
    if not output_root.is_absolute():
        output_root = (PROJECT_ROOT / output_root).resolve()
    run_dir = output_root / run_name
    overlay_path = run_dir / f'{run_name}_overlay.mp4'
    compare_path = run_dir / f'{run_name}_side_by_side.mp4'
    track_cache_path = run_dir / f'{run_name}_bytetrack_boxes.pt'
    keypoint_cache_path = run_dir / f'{run_name}_rtmpose_keypoints.pt'
    profile_path = run_dir / 'performance_profile.json'
    seed_marker = run_dir / '__missing__seed.pt'
    local_bbx_marker = run_dir / '__missing__bbx.pt'

    video_info: dict[str, float | int] | None = None
    profile: dict[str, Any] | None = None
    started_at = time.perf_counter()

    try:
        if not video_path.is_file():
            raise FileNotFoundError(f'输入视频不存在: {video_path}')
        selected_tracker = TRACKER_SCRIPT if args.foundation_strategy == 'legacy' else SPARSE_TRACKER_SCRIPT
        if not selected_tracker.is_file():
            raise FileNotFoundError(f'当前 Foundation tracker 不存在: {selected_tracker}')
        if run_dir.exists() and any(run_dir.iterdir()) and not args.force:
            raise FileExistsError(f'输出已存在，请更换 --name 或使用 --force: {run_dir}')

        source_info = probe_video(video_path)
        run_dir.mkdir(parents=True, exist_ok=True)
        if args.foundation_strategy == 'legacy':
            tracker_command = [
                sys.executable,
                str(TRACKER_SCRIPT),
                '--input', str(video_path),
                '--output', str(overlay_path),
                '--compare-output', str(compare_path),
                '--slow-output', '',
                '--slow-compare-output', '',
                '--track-cache', str(track_cache_path),
                '--keypoint-cache', str(keypoint_cache_path),
                '--seed-kp', str(seed_marker),
                '--local-bbx', str(local_bbx_marker),
            ]
            if args.max_frames > 0:
                tracker_command.extend(['--max-frames', str(args.max_frames)])
            if args.profile:
                tracker_command.extend(['--profile-json', str(profile_path)])
            if args.force:
                tracker_command.extend(['--force-redo-track', '--force-redo-pose'])
            required_outputs = (track_cache_path, keypoint_cache_path, overlay_path)
        else:
            tracker_command = [
                sys.executable,
                str(SPARSE_TRACKER_SCRIPT),
                '--input', str(video_path),
                '--output-dir', str(run_dir),
                '--analysis-fps', str(args.analysis_fps),
                '--max-pose-calls-per-analysis-frame', str(args.max_pose_calls_per_analysis_frame),
            ]
            if args.max_analysis_frames > 0:
                tracker_command.extend(['--max-analysis-frames', str(args.max_analysis_frames)])
            if args.force:
                tracker_command.append('--force')
            overlay_path = run_dir / 'overlay.mp4'
            track_cache_path = run_dir / 'tracking_cache.pt'
            keypoint_cache_path = run_dir / 'keypoint_cache.pt'
            profile_path = run_dir / 'performance_profile.json'
            required_outputs = (
                track_cache_path,
                keypoint_cache_path,
                run_dir / 'pose_sequence.pt',
                overlay_path,
                profile_path,
            )

        print('[Foundation] Tracker:', selected_tracker)
        print('[Foundation] Command:', ' '.join(tracker_command))
        subprocess.run(tracker_command, check=True, cwd=str(PROJECT_ROOT))

        missing_outputs = [path for path in required_outputs if not path.is_file() or path.stat().st_size <= 0]
        if missing_outputs:
            raise RuntimeError('缺少 Foundation 输出: ' + ', '.join(str(path) for path in missing_outputs))
        if args.profile or args.foundation_strategy == 'sparse_v1':
            if not profile_path.is_file() or profile_path.stat().st_size <= 0:
                raise RuntimeError(f'缺少性能报告: {profile_path}')
            profile = load_profile(profile_path)

        output_info = probe_video(overlay_path)
        processed_frames = int(output_info['frame_count'])
        profiled_frames = profile.get('pose', {}).get('pose_frames_processed') if profile else None
        if profiled_frames is not None:
            # Container metadata can over-report frames (for example test3.mov
            # reports 1601 while OpenCV can decode 1564).  The tracker profile
            # records the actual decoded/processed frame count.
            expected_frames = int(profiled_frames)
        else:
            expected_frames = int(source_info['frame_count'])
            if args.max_frames > 0:
                expected_frames = min(expected_frames, args.max_frames)
        if expected_frames > 0 and processed_frames != expected_frames:
            raise RuntimeError(f'Overlay 帧数异常: expected={expected_frames}, actual={processed_frames}')
        video_info = output_info
    except Exception as exc:
        print(f'\n[Foundation Test Error] {exc}', file=sys.stderr)
        print_summary(
            video_path=video_path,
            video_info=video_info,
            profile=profile,
            wall_total_s=time.perf_counter() - started_at,
            output_path=run_dir,
            status='FAIL',
            strategy=args.foundation_strategy,
        )
        return 1

    print_summary(
        video_path=video_path,
        video_info=video_info,
        profile=profile,
        wall_total_s=time.perf_counter() - started_at,
        output_path=run_dir,
        status='PASS',
        strategy=args.foundation_strategy,
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
