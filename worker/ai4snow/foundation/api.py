"""Stable public wrapper around Sparse Foundation v1 outputs."""

from __future__ import annotations

import json
from argparse import Namespace
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True, slots=True)
class PoseSequence:
    """Standardized, zero-inference view of the saved Sparse pose sequence."""

    source_frame_index: Any
    analysis_frame_index: Any
    timestamp: Any
    bbox: Any
    tracking_found: Any
    tracking_quality: Sequence[str]
    keypoints: Any
    keypoint_confidence: Any
    pose_quality: Sequence[str]
    pose_source: Sequence[str]

    def __len__(self) -> int:
        return int(len(self.source_frame_index))


@dataclass(frozen=True, slots=True)
class FoundationResult:
    """Files, timing, and standardized pose data from one Foundation run."""

    video_path: Path
    video_duration: float
    source_fps: float
    analysis_fps: float
    pose_sequence: PoseSequence
    pose_sequence_path: Path
    overlay_path: Path
    tracking_cache_path: Path
    keypoint_cache_path: Path
    profile_path: Path
    runtime: float
    rtf: float
    status: str

    @property
    def tracked_frames(self) -> int:
        return int(sum(bool(value) for value in self.pose_sequence.tracking_found))

    @property
    def pose_frames(self) -> int:
        return len(self.pose_sequence)


def _resolve_project_path(value: str | Path) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path.resolve()


def _load_pose_sequence(path: Path) -> PoseSequence:
    import torch

    payload = torch.load(path, map_location='cpu', weights_only=False)
    if not isinstance(payload, dict):
        raise ValueError(f'PoseSequence 格式无效: {path}')
    required = {
        'source_frame_index',
        'analysis_frame_index',
        'timestamp',
        'boxes_xyxy',
        'tracking_found',
        'keypoints',
        'pose_quality',
        'pose_source',
    }
    missing = sorted(required - set(payload))
    if missing:
        raise ValueError(f'PoseSequence 缺少字段 {missing}: {path}')

    keypoints_with_confidence = payload['keypoints']
    frame_count = int(len(payload['source_frame_index']))
    fields = (
        payload['analysis_frame_index'],
        payload['timestamp'],
        payload['boxes_xyxy'],
        payload['tracking_found'],
        keypoints_with_confidence,
        payload['pose_quality'],
        payload['pose_source'],
    )
    if any(len(field) != frame_count for field in fields):
        raise ValueError(f'PoseSequence 字段长度不一致: {path}')

    tracking_quality = tuple(
        'TRACKED' if bool(found) else 'LOST' for found in payload['tracking_found']
    )
    return PoseSequence(
        source_frame_index=payload['source_frame_index'],
        analysis_frame_index=payload['analysis_frame_index'],
        timestamp=payload['timestamp'],
        bbox=payload['boxes_xyxy'],
        tracking_found=payload['tracking_found'],
        tracking_quality=tracking_quality,
        keypoints=keypoints_with_confidence[..., :2],
        keypoint_confidence=keypoints_with_confidence[..., 2],
        pose_quality=tuple(str(value) for value in payload['pose_quality']),
        pose_source=tuple(str(value) for value in payload['pose_source']),
    )


def analyze_video(
    video_path: str | Path,
    output_dir: str | Path,
    *,
    max_analysis_frames: int = 0,
    force: bool = False,
) -> FoundationResult:
    """Run Sparse Foundation v1 and return its existing artifacts as a stable result."""

    if int(max_analysis_frames) < 0:
        raise ValueError('max_analysis_frames must be zero or greater')

    # Lazy import keeps the lightweight public types and CLI help importable in
    # environments where the inference dependencies are not loaded.
    from . import sparse_foundation as sparse

    resolved_video = _resolve_project_path(video_path)
    resolved_output = _resolve_project_path(output_dir)
    args = Namespace(
        input=str(resolved_video),
        output_dir=str(resolved_output),
        analysis_fps=sparse.DEFAULT_ANALYSIS_FPS,
        max_analysis_frames=int(max_analysis_frames),
        max_pose_calls_per_analysis_frame=sparse.DEFAULT_MAX_POSE_CALLS,
        detector_model=sparse.legacy.YOLO_DETECTOR_PATH,
        rtmpose_model=sparse.legacy.RTMPOSE_MODEL_URL,
        imgsz=sparse.legacy.YOLO_IMGSZ,
        conf=sparse.legacy.YOLO_CONF,
        force=bool(force),
    )
    profile = sparse.run_sparse(args)

    pose_sequence_path = resolved_output / 'pose_sequence.pt'
    overlay_path = resolved_output / 'overlay.mp4'
    tracking_cache_path = resolved_output / 'tracking_cache.pt'
    keypoint_cache_path = resolved_output / 'keypoint_cache.pt'
    profile_path = resolved_output / 'performance_profile.json'
    required_outputs = (
        pose_sequence_path,
        overlay_path,
        tracking_cache_path,
        keypoint_cache_path,
        profile_path,
    )
    missing = [path for path in required_outputs if not path.is_file() or path.stat().st_size <= 0]
    if missing:
        raise RuntimeError('缺少 Foundation 输出: ' + ', '.join(str(path) for path in missing))

    with profile_path.open('r', encoding='utf-8') as handle:
        saved_profile = json.load(handle)
    if saved_profile.get('foundation_strategy') != 'sparse_v1':
        raise RuntimeError(f'Foundation strategy 异常: {profile_path}')
    profile_video = saved_profile.get('video', {})
    profile_tracker = saved_profile.get('tracker', {})
    pose_sequence = _load_pose_sequence(pose_sequence_path)
    if len(pose_sequence) <= 0:
        raise RuntimeError(f'PoseSequence 为空: {pose_sequence_path}')

    return FoundationResult(
        video_path=resolved_video,
        video_duration=float(profile_video.get('duration_s', 0.0)),
        source_fps=float(profile_video.get('source_fps', 0.0)),
        analysis_fps=float(
            profile_video.get('effective_analysis_fps')
            or profile_video.get('requested_analysis_fps')
            or sparse.DEFAULT_ANALYSIS_FPS
        ),
        pose_sequence=pose_sequence,
        pose_sequence_path=pose_sequence_path,
        overlay_path=overlay_path,
        tracking_cache_path=tracking_cache_path,
        keypoint_cache_path=keypoint_cache_path,
        profile_path=profile_path,
        runtime=float(profile_tracker.get('total_s', profile['tracker']['total_s'])),
        rtf=float(profile_tracker.get('real_time_factor', profile['tracker']['real_time_factor'])),
        status='PASS',
    )
