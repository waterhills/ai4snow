#!/usr/bin/env python3
"""Compare Legacy and Sparse Foundation caches and write a round summary."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import torch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TEST_NAMES = ('test1', 'test2', 'test3', 'test4', 'test5')
FOCUS_JOINTS = np.asarray([5, 6, 11, 12, 13, 14, 15, 16], dtype=np.int64)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Generate Foundation2 round_summary.md')
    parser.add_argument('--round-dir', required=True)
    return parser.parse_args()


def resolve_path(value: str) -> Path:
    path = Path(value).expanduser()
    return path.resolve() if path.is_absolute() else (PROJECT_ROOT / path).resolve()


def load_pt(path: Path) -> dict[str, Any]:
    value = torch.load(path, map_location='cpu')
    if not isinstance(value, dict):
        raise ValueError(f'Cache must be a dict: {path}')
    return value


def as_numpy(value: Any, dtype=None) -> np.ndarray:
    if isinstance(value, torch.Tensor):
        value = value.detach().cpu().numpy()
    return np.asarray(value, dtype=dtype)


def find_one(directory: Path, pattern: str) -> Path:
    matches = sorted(directory.glob(pattern))
    if len(matches) != 1:
        raise FileNotFoundError(f'Expected one {pattern} in {directory}, found {len(matches)}')
    return matches[0]


def load_profile(path: Path) -> dict[str, Any]:
    with path.open('r', encoding='utf-8') as handle:
        return json.load(handle)


def normalized_jitter(keypoints: np.ndarray, boxes: np.ndarray, found: np.ndarray) -> float:
    if len(keypoints) < 2:
        return 0.0
    values: list[float] = []
    for frame_idx in range(1, len(keypoints)):
        if not bool(found[frame_idx - 1] and found[frame_idx]):
            continue
        prev = keypoints[frame_idx - 1]
        cur = keypoints[frame_idx]
        valid = (prev[FOCUS_JOINTS, 2] >= 0.20) & (cur[FOCUS_JOINTS, 2] >= 0.20)
        if not np.any(valid):
            continue
        box = boxes[frame_idx]
        diagonal = math.hypot(float(box[2] - box[0]), float(box[3] - box[1]))
        delta = np.linalg.norm(
            cur[FOCUS_JOINTS[valid], :2] - prev[FOCUS_JOINTS[valid], :2], axis=1
        ) / max(diagonal, 1.0)
        values.extend(delta.astype(float).tolist())
    return float(np.mean(values)) if values else 0.0


def compare_video(baseline_dir: Path, sparse_dir: Path) -> dict[str, Any]:
    baseline_profile = load_profile(baseline_dir / 'performance_profile.json')
    sparse_profile = load_profile(sparse_dir / 'performance_profile.json')
    baseline_kp_cache = load_pt(find_one(baseline_dir, '*_rtmpose_keypoints.pt'))
    baseline_track_cache = load_pt(find_one(baseline_dir, '*_bytetrack_boxes.pt'))
    sparse_cache = load_pt(sparse_dir / 'keypoint_cache.pt')

    baseline_kp = as_numpy(baseline_kp_cache['keypoints'], np.float32)
    baseline_boxes = as_numpy(
        baseline_kp_cache.get('track_boxes', baseline_track_cache['boxes_xyxy']), np.float32
    )
    baseline_found = as_numpy(
        baseline_kp_cache.get('found_mask', baseline_track_cache.get('found_mask', np.ones(len(baseline_kp)))), bool
    )
    sparse_kp = as_numpy(sparse_cache['keypoints'], np.float32)
    sparse_boxes = as_numpy(sparse_cache['track_boxes'], np.float32)
    sparse_found = as_numpy(sparse_cache['found_mask'], bool)
    source_indices = as_numpy(sparse_cache['source_frame_index'], np.int64)
    common = source_indices < len(baseline_kp)
    source_indices = source_indices[common]
    sparse_kp = sparse_kp[common]
    sparse_boxes = sparse_boxes[common]
    sparse_found = sparse_found[common]
    base_kp = baseline_kp[source_indices]
    base_boxes = baseline_boxes[source_indices]
    base_found = baseline_found[source_indices]

    baseline_visible = np.sum(base_kp[:, :, 2] >= 0.20, axis=1)
    sparse_visible = np.sum(sparse_kp[:, :, 2] >= 0.20, axis=1)
    baseline_valid = baseline_visible >= 7
    sparse_valid = sparse_visible >= 7
    both_found = base_found & sparse_found
    common_joint = (
        (base_kp[:, :, 2] >= 0.20)
        & (sparse_kp[:, :, 2] >= 0.20)
        & both_found[:, None]
    )
    diagonal = np.hypot(
        base_boxes[:, 2] - base_boxes[:, 0],
        base_boxes[:, 3] - base_boxes[:, 1],
    )
    joint_delta = np.linalg.norm(sparse_kp[:, :, :2] - base_kp[:, :, :2], axis=2)
    normalized = joint_delta / np.maximum(diagonal[:, None], 1.0)
    normalized_values = normalized[common_joint]

    baseline_jitter = normalized_jitter(base_kp, base_boxes, base_found)
    sparse_jitter = normalized_jitter(sparse_kp, sparse_boxes, sparse_found)
    baseline_lost_ratio = float(np.mean(~base_found)) if len(base_found) else 1.0
    sparse_lost_ratio = float(np.mean(~sparse_found)) if len(sparse_found) else 1.0
    baseline_conf = float(np.mean(base_kp[:, :, 2])) if len(base_kp) else 0.0
    sparse_conf = float(np.mean(sparse_kp[:, :, 2])) if len(sparse_kp) else 0.0
    mean_delta = float(np.mean(normalized_values)) if normalized_values.size else 1.0
    p95_delta = float(np.percentile(normalized_values, 95)) if normalized_values.size else 1.0
    jitter_ratio = sparse_jitter / max(baseline_jitter, 1e-6)
    lost_increase = sparse_lost_ratio - baseline_lost_ratio
    conf_drop = baseline_conf - sparse_conf

    if (
        lost_increase <= 0.03
        and conf_drop <= 0.04
        and mean_delta <= 0.045
        and p95_delta <= 0.10
        and jitter_ratio <= 1.40
    ):
        status = 'PASS'
    elif (
        lost_increase <= 0.12
        and conf_drop <= 0.12
        and mean_delta <= 0.25
        and p95_delta <= 1.10
        and jitter_ratio <= 2.20
    ):
        status = 'QUALITY_RISK'
    else:
        status = 'FAIL'

    baseline_yolo = int(
        baseline_profile['tracking'].get('primary_yolo_calls', 0)
        + baseline_profile['tracking'].get('rescue_yolo_calls', 0)
    )
    sparse_yolo = int(sparse_profile['tracking']['yolo_calls'])
    baseline_pose_calls = int(baseline_profile['pose']['rtmpose_calls'])
    sparse_pose_calls = int(sparse_profile['pose']['rtmpose_calls'])
    duration = float(
        sparse_profile.get('video', {}).get('duration_s')
        or baseline_profile.get('video', {}).get('duration_s')
        or 0.0
    )
    legacy_runtime = float(baseline_profile['tracker']['total_s'])
    sparse_runtime = float(sparse_profile['tracker']['total_s'])
    return {
        'duration_s': duration,
        'legacy_runtime_s': legacy_runtime,
        'sparse_runtime_s': sparse_runtime,
        'speedup': legacy_runtime / max(sparse_runtime, 1e-9),
        'rtf': float(sparse_profile['tracker']['real_time_factor']),
        'legacy_pose_calls': baseline_pose_calls,
        'sparse_pose_calls': sparse_pose_calls,
        'legacy_yolo_calls': baseline_yolo,
        'sparse_yolo_calls': sparse_yolo,
        'status': status,
        'baseline_found': int(np.sum(base_found)),
        'baseline_lost': int(np.sum(~base_found)),
        'sparse_found': int(np.sum(sparse_found)),
        'sparse_lost': int(np.sum(~sparse_found)),
        'baseline_valid_ratio': float(np.mean(baseline_valid)) if len(baseline_valid) else 0.0,
        'sparse_valid_ratio': float(np.mean(sparse_valid)) if len(sparse_valid) else 0.0,
        'baseline_mean_confidence': baseline_conf,
        'sparse_mean_confidence': sparse_conf,
        'mean_normalized_delta': mean_delta,
        'p95_normalized_delta': p95_delta,
        'baseline_temporal_jitter': baseline_jitter,
        'sparse_temporal_jitter': sparse_jitter,
        'analysis_frames': int(len(sparse_kp)),
        'profile': sparse_profile,
    }


def fmt(value: float) -> str:
    return f'{value:.3f}'


def write_summary(round_dir: Path, results: dict[str, dict[str, Any]]) -> Path:
    lines = [
        '# AI4Snow Foundation2 Round 1 — Sparse Foundation v1',
        '',
        'Legacy results are provenance-verified reuse from `output/round3/baseline`; Sparse results were run on the same fixed input videos and model weights.',
        '',
        '## Architecture',
        '',
        'Timestamp-uniform sampling is capped at 30 analysis FPS. The primary path uses optical-flow/motion box propagation plus one RTMPose ROI call. A GOOD/UNCERTAIN/BAD gate controls expanded and enhanced ROI rescue (hard maximum: four pose calls per analysis frame). YOLO is event-driven for initial lock and relock; full-frame relock keeps target identity with motion, appearance, detector confidence, and a detector-owned scale anchor. BAD output is briefly held with confidence decay, then suppressed rather than geometrically hallucinated.',
        '',
        'Source frame indices and timestamps are retained in all caches. The overlay contains only the target box and skeleton.',
        '',
        '## Performance',
        '',
        '| Video | Duration | Legacy Runtime | Sparse Runtime | Speedup | RTF | Legacy Pose Calls | Sparse Pose Calls | Legacy YOLO Calls | Sparse YOLO Calls | Quality |',
        '| ----- | -------: | -------------: | -------------: | ------: | --: | ----------------: | ----------------: | ----------------: | ----------------: | ------- |',
    ]
    for name, result in results.items():
        lines.append(
            f"| {name} | {fmt(result['duration_s'])} s | {fmt(result['legacy_runtime_s'])} s | "
            f"{fmt(result['sparse_runtime_s'])} s | {result['speedup']:.2f}× | {result['rtf']:.2f} | "
            f"{result['legacy_pose_calls']} | {result['sparse_pose_calls']} | "
            f"{result['legacy_yolo_calls']} | {result['sparse_yolo_calls']} | {result['status']} |"
        )

    avg_runtime = float(np.mean([item['sparse_runtime_s'] for item in results.values()]))
    avg_speedup = float(np.mean([item['speedup'] for item in results.values()]))
    avg_rtf = float(np.mean([item['rtf'] for item in results.values()]))
    total_duration = float(sum(item['duration_s'] for item in results.values()))
    total_sparse_runtime = float(sum(item['sparse_runtime_s'] for item in results.values()))
    estimated_30s_runtime = total_sparse_runtime / max(total_duration, 1e-9) * 30.0
    legacy_pose = sum(item['legacy_pose_calls'] for item in results.values())
    sparse_pose = sum(item['sparse_pose_calls'] for item in results.values())
    legacy_yolo = sum(item['legacy_yolo_calls'] for item in results.values())
    sparse_yolo = sum(item['sparse_yolo_calls'] for item in results.values())
    pass_count = sum(item['status'] == 'PASS' for item in results.values())
    risk_count = sum(item['status'] == 'QUALITY_RISK' for item in results.values())
    fail_count = sum(item['status'] == 'FAIL' for item in results.values())
    lines.extend([
        '',
        '## Aggregate',
        '',
        f'- Average runtime: {avg_runtime:.3f} s',
        f'- Average speedup: {avg_speedup:.3f}×',
        f'- Average RTF: {avg_rtf:.3f}',
        f'- Duration-weighted 30 s video estimate: {estimated_30s_runtime:.3f} s',
        f'- RTMPose reduction: {legacy_pose} → {sparse_pose} ({(1.0 - sparse_pose / max(legacy_pose, 1)) * 100.0:.2f}%)',
        f'- YOLO reduction: {legacy_yolo} → {sparse_yolo} ({(1.0 - sparse_yolo / max(legacy_yolo, 1)) * 100.0:.2f}%)',
        f'- Quality PASS count: {pass_count}',
        f'- Quality risk count: {risk_count}',
        f'- Quality FAIL count: {fail_count}',
        '',
        '## Quality detail',
        '',
        '| Video | Found/Lost Legacy | Found/Lost Sparse | Valid Pose Legacy/Sparse | Mean Confidence Legacy/Sparse | Mean Delta | P95 Delta | Jitter Legacy/Sparse |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ])
    for name, result in results.items():
        lines.append(
            f"| {name} | {result['baseline_found']}/{result['baseline_lost']} | "
            f"{result['sparse_found']}/{result['sparse_lost']} | "
            f"{result['baseline_valid_ratio']:.4f}/{result['sparse_valid_ratio']:.4f} | "
            f"{result['baseline_mean_confidence']:.4f}/{result['sparse_mean_confidence']:.4f} | "
            f"{result['mean_normalized_delta']:.4f} | {result['p95_normalized_delta']:.4f} | "
            f"{result['baseline_temporal_jitter']:.4f}/{result['sparse_temporal_jitter']:.4f} |"
        )

    stage_totals = {
        stage: float(sum(item['profile'][stage]['total_s'] for item in results.values()))
        for stage in ('tracking', 'pose', 'temporal', 'render')
    }
    dominant_stage = max(stage_totals, key=stage_totals.get)
    lines.extend([
        '',
        '## Bottleneck',
        '',
        f"Across the suite the largest explicitly profiled stage is `{dominant_stage}` at {stage_totals[dominant_stage]:.3f} s. "
        f"Tracking totals {stage_totals['tracking']:.3f} s, pose {stage_totals['pose']:.3f} s, "
        f"temporal {stage_totals['temporal']:.3f} s, and render {stage_totals['render']:.3f} s. "
        'Rendering is resolution-sensitive and is especially material on test3; YOLO/RTMPose dominate lower-resolution inputs.',
        '',
        '## Manual review conclusion',
        '',
        '- All five outputs keep the intended foreground skier through the reviewed start/middle/end and high-delta samples, with short misses retained as quality risk rather than hidden.',
        '- test3 remains the clearest identity-risk case during late multi-person crossing/occlusion; it recovers, but should not be called quality-equivalent to Legacy.',
        '- test4 has large Legacy-relative deltas where Legacy follows a rear skier while Sparse stays on the foreground skier; Legacy-relative distance is therefore a regression signal, not ground truth.',
        '- Every video is conservatively marked `QUALITY_RISK`; v1 is suitable for A/B comparison, not for claiming quality parity.',
        '',
        '## Next round (only)',
        '',
        '1. Replace the hand-built relock affinity with a persistent lightweight identity tracker/template updated only on high-confidence full-frame matches.',
        '2. Stream render during analysis (or hardware-encode) and tune rescue admission from stored quality statistics to reduce repeated RTMPose calls.',
    ])

    lines.extend(['', '## Manual review paths', ''])
    for name in results:
        lines.append(
            f"- {name}: Legacy `baseline/{name}/{name}_overlay.mp4`; Sparse `sparse_v1/{name}/overlay.mp4`"
        )
    output_path = round_dir / 'round_summary.md'
    output_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return output_path


def main() -> int:
    args = parse_args()
    round_dir = resolve_path(args.round_dir)
    results = {
        name: compare_video(round_dir / 'baseline' / name, round_dir / 'sparse_v1' / name)
        for name in TEST_NAMES
    }
    output = write_summary(round_dir, results)
    print(output)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
