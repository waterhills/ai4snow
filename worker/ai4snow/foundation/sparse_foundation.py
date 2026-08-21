#!/usr/bin/env python3
"""Sparse Foundation v1: timestamp sampling, single-ROI pose, and sparse rescue."""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch
from tqdm import tqdm

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import video_keypoint_tracker as legacy


DEFAULT_ANALYSIS_FPS = 30.0
DEFAULT_MAX_POSE_CALLS = 4


@dataclass
class VideoInfo:
    fps: float
    frame_count: int
    width: int
    height: int

    @property
    def duration_s(self) -> float:
        return float(self.frame_count / self.fps) if self.fps > 0.0 else 0.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='AI4Snow Sparse Foundation v1')
    parser.add_argument('--input', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--analysis-fps', type=float, default=DEFAULT_ANALYSIS_FPS)
    parser.add_argument('--max-analysis-frames', type=int, default=0)
    parser.add_argument('--max-pose-calls-per-analysis-frame', type=int, default=DEFAULT_MAX_POSE_CALLS)
    parser.add_argument('--detector-model', default=legacy.YOLO_DETECTOR_PATH)
    parser.add_argument('--rtmpose-model', default=legacy.RTMPOSE_MODEL_URL)
    parser.add_argument('--imgsz', type=int, default=legacy.YOLO_IMGSZ)
    parser.add_argument('--conf', type=float, default=legacy.YOLO_CONF)
    parser.add_argument('--force', action='store_true')
    return parser.parse_args()


def resolve_project_path(value: str) -> Path:
    path = Path(value).expanduser()
    return path.resolve() if path.is_absolute() else (PROJECT_ROOT / path).resolve()


def probe_video(path: Path) -> VideoInfo:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f'无法打开视频: {path}')
    try:
        return VideoInfo(
            fps=float(cap.get(cv2.CAP_PROP_FPS)),
            frame_count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
            width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        )
    finally:
        cap.release()


def analysis_frame_indices(info: VideoInfo, analysis_fps: float) -> list[int]:
    """Return a timestamp-uniform schedule, retaining all frames at <= target FPS."""
    if info.frame_count <= 0 or info.fps <= 0.0:
        return []
    target_fps = min(max(float(analysis_fps), 1.0), info.fps)
    if info.fps <= target_fps + 1e-6:
        return list(range(info.frame_count))

    interval_s = 1.0 / target_fps
    half_source_step = 0.5 / info.fps
    next_timestamp = 0.0
    selected: list[int] = []
    for source_index in range(info.frame_count):
        timestamp = source_index / info.fps
        if timestamp + half_source_step < next_timestamp:
            continue
        selected.append(source_index)
        while next_timestamp <= timestamp + half_source_step:
            next_timestamp += interval_s
    return selected


def resize_for_foundation(frame: np.ndarray) -> np.ndarray:
    height, width = frame.shape[:2]
    if max(height, width) <= 1080:
        return frame
    scale = 1080.0 / max(height, width)
    return cv2.resize(
        frame,
        (max(2, int(round(width * scale))), max(2, int(round(height * scale)))),
        interpolation=cv2.INTER_AREA,
    )


def detector_predict(
    detector,
    frame: np.ndarray,
    imgsz: int,
    conf: float,
    profile: dict[str, Any],
    *,
    scope: str = 'full',
):
    started_at = time.perf_counter()
    try:
        results = detector.predict(frame, imgsz=imgsz, conf=conf, verbose=False, classes=[0])
    except Exception:
        results = detector(frame, imgsz=imgsz, conf=conf, verbose=False, classes=[0])
    elapsed = time.perf_counter() - started_at
    profile['tracking']['yolo_calls'] += 1
    profile['tracking'][f'{scope}_frame_yolo_calls'] += 1
    profile['tracking']['yolo_inference_s'] += float(elapsed)
    boxes = results[0].boxes if results else None
    boxes_xyxy = (
        boxes.xyxy.detach().cpu().numpy().astype(np.float32)
        if boxes is not None and boxes.xyxy is not None
        else np.zeros((0, 4), dtype=np.float32)
    )
    scores = (
        boxes.conf.detach().cpu().numpy().astype(np.float32)
        if boxes is not None and boxes.conf is not None
        else np.zeros((0,), dtype=np.float32)
    )
    return boxes_xyxy, scores


def detector_relock_roi(
    detector,
    frame: np.ndarray,
    search_box: np.ndarray,
    conf: float,
    profile: dict[str, Any],
    lost_frames: int,
) -> tuple[np.ndarray, np.ndarray]:
    scale = 3.0 if lost_frames <= 4 else (3.5 if lost_frames <= 10 else 4.2)
    roi_box = legacy.expand_box_xyxy(
        search_box,
        scale,
        shift_y_ratio=-0.02,
        frame_shape=frame.shape[:2],
    )
    x1, y1, x2, y2 = np.round(roi_box).astype(int)
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return np.zeros((0, 4), dtype=np.float32), np.zeros((0,), dtype=np.float32)
    boxes, scores = detector_predict(
        detector,
        crop,
        imgsz=640,
        conf=max(0.10, conf * 0.72),
        profile=profile,
        scope='roi',
    )
    if len(boxes) == 0:
        return boxes, scores
    mapped = boxes.copy().astype(np.float32)
    mapped[:, [0, 2]] += float(x1)
    mapped[:, [1, 3]] += float(y1)
    mapped = np.asarray(
        [legacy.clamp_box_xyxy(box, frame.shape[:2]) for box in mapped], dtype=np.float32
    )
    return mapped, scores


def select_detection(
    frame: np.ndarray,
    boxes: np.ndarray,
    scores: np.ndarray,
    prev_box: np.ndarray | None,
    predicted_box: np.ndarray | None,
    appearance_anchor,
    appearance_recent,
    lost_frames: int,
):
    if prev_box is not None and len(boxes) > 0:
        best = None
        for index, candidate in enumerate(boxes):
            candidate = legacy.clamp_box_xyxy(candidate, frame.shape[:2])
            affinity = legacy.compute_target_affinity(candidate, prev_box, predicted_box, None)
            candidate_size = legacy.box_size(candidate)
            reference_size = legacy.box_size(predicted_box if predicted_box is not None else prev_box)
            size_ratio = candidate_size / max(reference_size, 1.0)
            max_size_ratio = 1.35 if lost_frames <= 3 else (1.55 if lost_frames <= 10 else 1.85)
            min_size_ratio = 0.68 if lost_frames <= 3 else (0.55 if lost_frames <= 10 else 0.42)
            if not (min_size_ratio <= size_ratio <= max_size_ratio):
                continue
            if affinity['anchor_center'] > (0.95 if lost_frames >= 5 else 0.68) and affinity['anchor_iou'] < 0.01:
                continue
            appearance_score, _ = legacy.compute_appearance_score(
                frame, candidate, appearance_anchor, appearance_recent
            )
            det_score = float(scores[index]) if index < len(scores) else 0.0
            size_score = float(np.clip(1.0 - abs(math.log(max(size_ratio, 1e-3))) / math.log(1.8), 0.0, 1.0))
            total = (
                0.50 * float(affinity['anchor_score'])
                + 0.24 * float(appearance_score)
                + 0.16 * float(np.clip(det_score, 0.0, 1.0))
                + 0.10 * size_score
            )
            key = (total, float(affinity['anchor_score']), det_score)
            if best is None or key > best[0]:
                best = (key, candidate, det_score, appearance_score)
        if best is None:
            return None, -1e9, 0.0, 0.50
        _, box, det_score, appearance_score = best
        return box, float(best[0][0]), det_score, float(appearance_score)

    box, _, score, det_score, appearance_score = legacy.select_primary_detection(
        frame,
        boxes,
        scores,
        None,
        prev_box,
        predicted_box,
        1 if prev_box is not None else None,
        None,
        lost_frames,
        # Select spatially first.  The Legacy selector's internal appearance
        # gate is tuned for frequent detections and can reject a correct skier
        # after large distance/lighting changes; Sparse applies appearance as a
        # post-selection veto only when the spatial anchor is also weak.
        appearance_anchor=None,
        appearance_recent=None,
    )
    if box is None:
        return None, score, det_score, appearance_score
    if appearance_anchor is not None or appearance_recent is not None:
        appearance_score, _ = legacy.compute_appearance_score(
            frame, box, appearance_anchor, appearance_recent
        )
    if prev_box is not None:
        affinity = legacy.compute_target_affinity(box, prev_box, predicted_box, None)
        size_ratio = max(legacy.box_size(box), legacy.box_size(prev_box)) / max(
            min(legacy.box_size(box), legacy.box_size(prev_box)), 1.0
        )
        appearance_floor = 0.24 if lost_frames >= 3 else 0.32
        # Distance and lighting can make the simple torso histogram weak.  A
        # detection that is still strongly anchored in position/scale is safer
        # than rejecting the only correct far-distance relock.
        if (
            appearance_anchor is not None
            and appearance_score < appearance_floor
            and affinity['anchor_score'] < 0.65
        ):
            return None, score, det_score, appearance_score
        if affinity['anchor_center'] > (0.95 if lost_frames >= 5 else 0.68) and affinity['anchor_iou'] < 0.01:
            return None, score, det_score, appearance_score
        if size_ratio > (2.0 if lost_frames >= 5 else 1.65):
            return None, score, det_score, appearance_score
    return legacy.clamp_box_xyxy(box, frame.shape[:2]), score, det_score, appearance_score


def select_full_relock_detection(
    frame: np.ndarray,
    boxes: np.ndarray,
    scores: np.ndarray,
    predicted_box: np.ndarray | None,
    detector_anchor_box: np.ndarray | None,
    appearance_anchor,
    appearance_recent,
) -> np.ndarray | None:
    """Select a global relock without letting a drifted local box veto the target."""
    best = None
    for index, candidate in enumerate(boxes):
        candidate = legacy.clamp_box_xyxy(candidate, frame.shape[:2])
        det_score = float(scores[index]) if index < len(scores) else 0.0
        appearance_score, _ = legacy.compute_appearance_score(
            frame, candidate, appearance_anchor, appearance_recent
        )
        if predicted_box is not None:
            affinity = legacy.compute_target_affinity(
                candidate, predicted_box, predicted_box, None
            )
            spatial_score = float(affinity['anchor_score'])
        else:
            spatial_score = 0.5
        if detector_anchor_box is not None:
            size_ratio = legacy.box_size(candidate) / max(
                legacy.box_size(detector_anchor_box), 1.0
            )
            size_score = float(
                np.clip(1.0 - abs(math.log(max(size_ratio, 1e-3))) / math.log(3.0), 0.0, 1.0)
            )
        else:
            size_score = 0.5
        total = (
            0.42 * float(appearance_score)
            + 0.25 * float(np.clip(det_score, 0.0, 1.0))
            + 0.18 * size_score
            + 0.15 * spatial_score
        )
        key = (total, appearance_score, det_score)
        if best is None or key > best[0]:
            best = (key, candidate)
    return None if best is None else best[1]


def constrain_box_step(
    box: np.ndarray,
    previous: np.ndarray | None,
    frame_shape,
    *,
    max_scale_ratio: float = 1.10,
    max_center_shift_ratio: float = 0.55,
) -> np.ndarray:
    box = legacy.clamp_box_xyxy(box, frame_shape)
    if previous is None:
        return box
    previous = legacy.clamp_box_xyxy(previous, frame_shape)
    previous_size = legacy.box_size(previous)
    current_size = legacy.box_size(box)
    size = float(np.clip(
        current_size,
        previous_size / max_scale_ratio,
        previous_size * max_scale_ratio,
    ))
    previous_center = legacy.box_center(previous)
    current_center = legacy.box_center(box)
    delta = current_center - previous_center
    max_shift = previous_size * max_center_shift_ratio
    distance = float(np.linalg.norm(delta))
    if distance > max_shift and distance > 1e-6:
        delta *= max_shift / distance
    center = previous_center + delta
    half = size * 0.5
    return legacy.clamp_box_xyxy(
        np.asarray([center[0] - half, center[1] - half, center[0] + half, center[1] + half], dtype=np.float32),
        frame_shape,
    )


def constrain_box_scale_to_anchor(
    box: np.ndarray,
    anchor: np.ndarray | None,
    frame_shape,
    *,
    max_scale_ratio: float = 1.45,
) -> np.ndarray:
    """Prevent repeated weak updates from growing/shrinking the track box without bound."""
    box = legacy.clamp_box_xyxy(box, frame_shape)
    if anchor is None:
        return box
    anchor = legacy.clamp_box_xyxy(anchor, frame_shape)
    size = float(np.clip(
        legacy.box_size(box),
        legacy.box_size(anchor) / max_scale_ratio,
        legacy.box_size(anchor) * max_scale_ratio,
    ))
    center = legacy.box_center(box)
    half = size * 0.5
    return legacy.clamp_box_xyxy(
        np.asarray([center[0] - half, center[1] - half, center[0] + half, center[1] + half], dtype=np.float32),
        frame_shape,
    )


def points_in_box(gray: np.ndarray, box: np.ndarray | None) -> np.ndarray | None:
    if box is None:
        return None
    mask = np.zeros_like(gray, dtype=np.uint8)
    x1, y1, x2, y2 = np.round(legacy.clamp_box_xyxy(box, gray.shape[:2])).astype(int)
    inset_x = max(1, int((x2 - x1) * 0.08))
    inset_y = max(1, int((y2 - y1) * 0.06))
    cv2.rectangle(mask, (x1 + inset_x, y1 + inset_y), (x2 - inset_x, y2 - inset_y), 255, -1)
    return cv2.goodFeaturesToTrack(
        gray,
        mask=mask,
        maxCorners=100,
        qualityLevel=0.01,
        minDistance=5,
        blockSize=7,
    )


def propagate_box(
    prev_gray: np.ndarray | None,
    gray: np.ndarray,
    prev_box: np.ndarray | None,
    prev_prev_box: np.ndarray | None,
    prev_points: np.ndarray | None,
) -> tuple[np.ndarray | None, bool, np.ndarray | None]:
    if prev_box is None:
        return None, False, None
    motion_prediction = legacy.predict_next_box(prev_box, prev_prev_box, gray.shape[:2])
    if prev_gray is None:
        return motion_prediction, False, points_in_box(gray, motion_prediction)
    if prev_points is None or len(prev_points) < 8:
        prev_points = points_in_box(prev_gray, prev_box)
    if prev_points is None or len(prev_points) < 4:
        return motion_prediction, False, points_in_box(gray, motion_prediction)

    next_points, status, errors = cv2.calcOpticalFlowPyrLK(
        prev_gray,
        gray,
        prev_points,
        None,
        winSize=(25, 25),
        maxLevel=3,
        criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01),
    )
    if next_points is None or status is None:
        return motion_prediction, False, points_in_box(gray, motion_prediction)
    valid = status.reshape(-1) == 1
    if errors is not None:
        valid &= errors.reshape(-1) < 35.0
    old = prev_points.reshape(-1, 2)[valid]
    new = next_points.reshape(-1, 2)[valid]
    if len(old) < 4:
        return motion_prediction, False, points_in_box(gray, motion_prediction)

    displacement = new - old
    median_disp = np.median(displacement, axis=0)
    residual = np.linalg.norm(displacement - median_disp[None, :], axis=1)
    robust = residual <= max(3.0, float(np.median(residual) * 2.5 + 1.0))
    old = old[robust]
    new = new[robust]
    if len(old) < 4:
        return motion_prediction, False, points_in_box(gray, motion_prediction)

    affine, inliers = cv2.estimateAffinePartial2D(
        old,
        new,
        method=cv2.RANSAC,
        ransacReprojThreshold=3.0,
        maxIters=1000,
        confidence=0.98,
    )
    flow_box = None
    inlier_ratio = 0.0
    if affine is not None:
        scale = float(math.hypot(float(affine[0, 0]), float(affine[0, 1])))
        inlier_ratio = float(np.mean(inliers)) if inliers is not None and len(inliers) else 0.0
        if 0.82 <= scale <= 1.22:
            x1, y1, x2, y2 = prev_box
            corners = np.asarray([[[x1, y1]], [[x2, y1]], [[x2, y2]], [[x1, y2]]], dtype=np.float32)
            transformed = cv2.transform(corners, affine).reshape(-1, 2)
            flow_box = np.asarray(
                [transformed[:, 0].min(), transformed[:, 1].min(), transformed[:, 0].max(), transformed[:, 1].max()],
                dtype=np.float32,
            )
    if flow_box is None:
        delta = np.median(new - old, axis=0)
        flow_box = prev_box + np.asarray([delta[0], delta[1], delta[0], delta[1]], dtype=np.float32)

    flow_box = legacy.clamp_box_xyxy(flow_box, gray.shape[:2])
    max_shift_ratio = legacy.box_center_distance_ratio(flow_box, prev_box)
    size_ratio = max(legacy.box_size(flow_box), legacy.box_size(prev_box)) / max(
        min(legacy.box_size(flow_box), legacy.box_size(prev_box)), 1.0
    )
    flow_ok = bool(len(old) >= 6 and inlier_ratio >= 0.45 and max_shift_ratio <= 0.55 and size_ratio <= 1.30)
    if not flow_ok:
        flow_box = motion_prediction
    elif motion_prediction is not None:
        flow_box = legacy.blend_boxes(flow_box, motion_prediction, 0.18)
    return flow_box, flow_ok, points_in_box(gray, flow_box)


def pose_in_roi(
    frame: np.ndarray,
    roi: np.ndarray,
    pose_model,
    prev_kp: np.ndarray | None,
    profile: dict[str, Any],
    *,
    enhanced: bool = False,
) -> tuple[np.ndarray | None, float, float, int]:
    started_at = time.perf_counter()
    crop, origin = legacy.crop_from_box(frame, roi)
    if crop.size == 0:
        profile['pose']['total_s'] += float(time.perf_counter() - started_at)
        return None, -1e9, 0.0, 0
    if enhanced:
        crop = legacy.enhance_backlit_image(crop, strong=True)
    processed, scale = legacy.maybe_upscale_crop(crop, None, legacy.SMALL_BOX_THRESHOLD)
    result = legacy.infer_pose_from_processed_crop(
        processed,
        origin,
        scale,
        pose_model,
        ref_kp=prev_kp,
        profile=profile,
    )
    profile['pose']['total_s'] += float(time.perf_counter() - started_at)
    return result


def assess_pose(
    kp: np.ndarray | None,
    roi: np.ndarray,
    prev_kp: np.ndarray | None,
) -> tuple[str, dict[str, float | int | bool]]:
    if kp is None:
        return 'BAD', {
            'mean_confidence': 0.0,
            'visible_joints': 0,
            'temporal_score': 0.0,
            'degenerate': True,
            'bbox_consistent': False,
            'candidate_score': -1e9,
        }
    conf = np.clip(kp[:, 2], 0.0, 1.0)
    mean_conf = legacy.weighted_mean_conf(conf)
    visible = int(np.sum(conf >= 0.20))
    temporal = legacy.joint_match_score(kp[:, :2], conf, prev_kp) if prev_kp is not None else 0.75
    degenerate = legacy.is_degenerate_pose(kp, roi)
    pose_box = legacy.estimate_box_from_keypoints(kp[:, :2], conf, conf_thresh=0.20)
    bbox_consistent = False
    if pose_box is not None:
        center_ratio = legacy.box_center_distance_ratio(pose_box, roi)
        size_ratio = legacy.box_size(pose_box) / max(legacy.box_size(roi), 1.0)
        bbox_consistent = bool(center_ratio <= 0.42 and 0.10 <= size_ratio <= 1.10)
    candidate_score = legacy.score_pose_candidate(kp, roi, prev_kp, None, crowded=False)

    good = bool(
        not degenerate
        and bbox_consistent
        and visible >= 10
        and mean_conf >= 0.56
        and (prev_kp is None or temporal >= 0.50)
        and candidate_score > -1e8
    )
    uncertain = bool(
        not degenerate
        and visible >= 7
        and mean_conf >= 0.38
        and (prev_kp is None or temporal >= 0.25)
        and candidate_score > -1e8
    )
    quality = 'GOOD' if good else ('UNCERTAIN' if uncertain else 'BAD')
    return quality, {
        'mean_confidence': float(mean_conf),
        'visible_joints': visible,
        'temporal_score': float(temporal),
        'degenerate': bool(degenerate),
        'bbox_consistent': bool(bbox_consistent),
        'candidate_score': float(candidate_score),
    }


def quality_rank(value: str) -> int:
    return {'BAD': 0, 'UNCERTAIN': 1, 'GOOD': 2}[value]


def choose_better_pose(current, candidate):
    if current is None:
        return candidate
    current_quality, current_stats = current[1], current[2]
    candidate_quality, candidate_stats = candidate[1], candidate[2]
    current_key = (quality_rank(current_quality), float(current_stats['candidate_score']), float(current_stats['mean_confidence']))
    candidate_key = (quality_rank(candidate_quality), float(candidate_stats['candidate_score']), float(candidate_stats['mean_confidence']))
    return candidate if candidate_key > current_key else current


def update_track_box_from_pose(track_box: np.ndarray, kp: np.ndarray, frame_shape) -> np.ndarray:
    pose_box = legacy.estimate_box_from_keypoints(kp[:, :2], kp[:, 2], conf_thresh=0.20)
    if pose_box is None:
        return track_box
    pose_person_box = legacy.expand_box_xyxy(pose_box, 1.26, shift_y_ratio=-0.03, frame_shape=frame_shape)
    if legacy.box_center_distance_ratio(pose_person_box, track_box) > 0.48:
        return track_box
    size_ratio = max(legacy.box_size(pose_person_box), legacy.box_size(track_box)) / max(
        min(legacy.box_size(pose_person_box), legacy.box_size(track_box)), 1.0
    )
    if size_ratio > 1.55:
        return track_box
    return legacy.clamp_box_xyxy(legacy.blend_boxes(track_box, pose_person_box, 0.28), frame_shape)


def render_skeleton_only(
    input_path: Path,
    output_path: Path,
    source_indices: np.ndarray,
    keypoints: np.ndarray,
    boxes: np.ndarray,
    output_fps: float,
    profile: dict[str, Any],
) -> None:
    started_at = time.perf_counter()
    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        raise RuntimeError(f'无法打开视频: {input_path}')
    ok, first = cap.read()
    if not ok:
        cap.release()
        raise RuntimeError(f'无法解码视频: {input_path}')
    first = resize_for_foundation(first)
    height, width = first.shape[:2]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*'mp4v'),
        max(float(output_fps), 1.0),
        (width, height),
    )
    if not writer.isOpened():
        cap.release()
        raise RuntimeError(f'无法初始化视频输出: {output_path}')
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    wanted = {int(source): idx for idx, source in enumerate(source_indices.tolist())}
    frame_idx = 0
    written = 0
    with tqdm(total=len(source_indices), desc='Sparse Render', unit='frame') as pbar:
        while written < len(source_indices):
            ok, frame = cap.read()
            if not ok:
                break
            analysis_idx = wanted.get(frame_idx)
            if analysis_idx is not None:
                frame = resize_for_foundation(frame)
                kp = keypoints[analysis_idx]
                box = boxes[analysis_idx]
                overlay = legacy.draw_pose_overlay(frame, kp[:, :2], kp[:, 2], box)
                cv2.rectangle(
                    overlay,
                    tuple(np.round(box[:2]).astype(int)),
                    tuple(np.round(box[2:]).astype(int)),
                    (80, 210, 255),
                    1,
                    cv2.LINE_AA,
                )
                writer.write(overlay)
                written += 1
                pbar.update(1)
            frame_idx += 1
    cap.release()
    writer.release()
    if written != len(source_indices):
        raise RuntimeError(f'Sparse overlay 帧数异常: expected={len(source_indices)}, actual={written}')
    profile['render']['total_s'] = float(time.perf_counter() - started_at)


def make_profile(info: VideoInfo, analysis_fps: float, max_pose_calls: int) -> dict[str, Any]:
    return {
        'schema_version': 2,
        'foundation_strategy': 'sparse_v1',
        'video': {
            'source_fps': float(info.fps),
            'source_frames': int(info.frame_count),
            'duration_s': float(info.duration_s),
            'requested_analysis_fps': float(analysis_fps),
            'analysis_frames': 0,
            'effective_analysis_fps': 0.0,
        },
        'limits': {'max_pose_calls_per_analysis_frame': int(max_pose_calls)},
        'model_load': {'detector_s': 0.0, 'pose_s': 0.0, 'total_s': 0.0},
        'tracking': {
            'total_s': 0.0,
            'yolo_calls': 0,
            'full_frame_yolo_calls': 0,
            'roi_frame_yolo_calls': 0,
            'initial_yolo_calls': 0,
            'relock_yolo_calls': 0,
            'yolo_inference_s': 0.0,
            'found_frames': 0,
            'lost_frames': 0,
            'optical_flow_success_frames': 0,
        },
        'pose': {
            'total_s': 0.0,
            'pose_frames_processed': 0,
            'rtmpose_calls': 0,
            'rtmpose_inference_s': 0.0,
            'rtmpose_calls_per_analysis_frame': 0.0,
            'primary_pose_accepts': 0,
            'pose_rescue_frames': 0,
            'yolo_relock_frames': 0,
            'good_frames': 0,
            'uncertain_frames': 0,
            'bad_frames': 0,
            'max_calls_observed': 0,
        },
        'temporal': {'total_s': 0.0},
        'render': {'total_s': 0.0},
        'tracker': {'total_s': 0.0, 'real_time_factor': 0.0},
    }


def run_sparse(args: argparse.Namespace) -> dict[str, Any]:
    total_started_at = time.perf_counter()
    input_path = resolve_project_path(args.input)
    output_dir = resolve_project_path(args.output_dir)
    if not input_path.is_file():
        raise FileNotFoundError(f'输入视频不存在: {input_path}')
    if args.analysis_fps <= 0.0:
        raise ValueError('--analysis-fps must be positive')
    if args.max_pose_calls_per_analysis_frame < 1:
        raise ValueError('--max-pose-calls-per-analysis-frame must be at least 1')
    expected_outputs = [
        output_dir / 'tracking_cache.pt',
        output_dir / 'keypoint_cache.pt',
        output_dir / 'pose_sequence.pt',
        output_dir / 'performance_profile.json',
        output_dir / 'overlay.mp4',
    ]
    if output_dir.exists() and any(output_dir.iterdir()) and not args.force:
        raise FileExistsError(f'输出已存在，请使用 --force: {output_dir}')
    output_dir.mkdir(parents=True, exist_ok=True)

    info = probe_video(input_path)
    scheduled_indices = analysis_frame_indices(info, args.analysis_fps)
    if args.max_analysis_frames > 0:
        scheduled_indices = scheduled_indices[: int(args.max_analysis_frames)]
    if not scheduled_indices:
        raise RuntimeError('没有可处理的 analysis frame')
    profile = make_profile(info, args.analysis_fps, args.max_pose_calls_per_analysis_frame)

    detector_path = resolve_project_path(args.detector_model)
    if not detector_path.is_file():
        raise FileNotFoundError(f'检测模型不存在: {detector_path}')
    load_started = time.perf_counter()
    detector = legacy.load_detector(detector_path)
    profile['model_load']['detector_s'] = float(time.perf_counter() - load_started)
    load_started = time.perf_counter()
    pose_model = legacy.load_pose_model(args.rtmpose_model)
    profile['model_load']['pose_s'] = float(time.perf_counter() - load_started)
    profile['model_load']['total_s'] = float(
        profile['model_load']['detector_s'] + profile['model_load']['pose_s']
    )

    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        raise RuntimeError(f'无法打开视频: {input_path}')
    wanted = set(scheduled_indices)
    source_indices: list[int] = []
    timestamps: list[float] = []
    boxes_out: list[np.ndarray] = []
    found_out: list[bool] = []
    raw_keypoints: list[np.ndarray] = []
    pose_quality: list[str] = []
    pose_source: list[str] = []
    yolo_used_out: list[bool] = []
    pose_calls_out: list[int] = []
    rescue_used_out: list[bool] = []
    quality_stats_out: list[dict[str, Any]] = []

    prev_box = None
    prev_prev_box = None
    prev_gray = None
    prev_points = None
    trusted_kp = None
    detector_anchor_box = None
    temporal_kp = None
    appearance_anchor = None
    appearance_recent = None
    consecutive_non_good = 0
    lost_frames = 0
    last_yolo_analysis_idx = -1000000
    last_full_yolo_analysis_idx = -1000000
    source_idx = 0

    with tqdm(total=len(scheduled_indices), desc='Sparse Foundation', unit='analysis-frame') as pbar:
        while len(source_indices) < len(scheduled_indices):
            ok, frame = cap.read()
            if not ok:
                break
            if source_idx not in wanted:
                source_idx += 1
                continue
            frame = resize_for_foundation(frame)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            analysis_idx = len(source_indices)
            frame_tracking_started = time.perf_counter()
            predicted_box = legacy.predict_next_box(prev_box, prev_prev_box, frame.shape[:2])
            propagated_box, flow_ok, next_points = propagate_box(
                prev_gray, gray, prev_box, prev_prev_box, prev_points
            )
            yolo_used = False
            if prev_box is None:
                boxes, scores = detector_predict(
                    detector, frame, args.imgsz, args.conf, profile, scope='full'
                )
                profile['tracking']['initial_yolo_calls'] += 1
                last_yolo_analysis_idx = analysis_idx
                last_full_yolo_analysis_idx = analysis_idx
                yolo_used = True
                propagated_box, _, _, _ = select_detection(
                    frame, boxes, scores, None, None, None, None, 0
                )
                if propagated_box is None:
                    raise RuntimeError(f'初始帧无法锁定人物: source_frame_index={source_idx}')
                feature = legacy.extract_target_appearance(frame, propagated_box)
                appearance_anchor = feature
                appearance_recent = feature
                detector_anchor_box = propagated_box.copy()
                next_points = points_in_box(gray, propagated_box)
                flow_ok = True
            if propagated_box is None:
                propagated_box = prev_box.copy() if prev_box is not None else np.asarray(
                    [0.2 * frame.shape[1], 0.1 * frame.shape[0], 0.8 * frame.shape[1], 0.95 * frame.shape[0]],
                    dtype=np.float32,
                )
            propagated_box = constrain_box_step(
                propagated_box,
                prev_box,
                frame.shape[:2],
                max_scale_ratio=1.10,
                max_center_shift_ratio=0.55,
            )
            propagated_box = constrain_box_scale_to_anchor(
                propagated_box,
                detector_anchor_box,
                frame.shape[:2],
                max_scale_ratio=1.45,
            )
            profile['tracking']['total_s'] += float(time.perf_counter() - frame_tracking_started)
            if flow_ok:
                profile['tracking']['optical_flow_success_frames'] += 1

            call_start = int(profile['pose']['rtmpose_calls'])
            pose_reference = temporal_kp
            primary_context = 1.25 if legacy.box_size(propagated_box) < legacy.SMALL_BOX_THRESHOLD else 1.16
            primary_roi = legacy.expand_box_xyxy(
                propagated_box, primary_context, shift_y_ratio=-0.02, frame_shape=frame.shape[:2]
            )
            kp, _, _, _ = pose_in_roi(frame, primary_roi, pose_model, pose_reference, profile)
            quality, stats = assess_pose(kp, primary_roi, pose_reference)
            best = (kp, quality, stats, 'primary')
            primary_quality = quality
            rescue_used = False
            expanded_roi = None

            if quality != 'GOOD' and int(profile['pose']['rtmpose_calls']) - call_start < args.max_pose_calls_per_analysis_frame:
                rescue_used = True
                expanded_scale = 1.30 if quality == 'UNCERTAIN' else 1.48
                expanded_roi = legacy.expand_box_xyxy(
                    primary_roi, expanded_scale, shift_y_ratio=-0.025, frame_shape=frame.shape[:2]
                )
                rescue_kp, _, _, _ = pose_in_roi(frame, expanded_roi, pose_model, pose_reference, profile)
                rescue_quality, rescue_stats = assess_pose(rescue_kp, expanded_roi, pose_reference)
                best = choose_better_pose(best, (rescue_kp, rescue_quality, rescue_stats, 'expanded'))

            if best[1] == 'BAD' and int(profile['pose']['rtmpose_calls']) - call_start < args.max_pose_calls_per_analysis_frame:
                rescue_used = True
                enhanced_roi = expanded_roi if expanded_roi is not None else primary_roi
                rescue_kp, _, _, _ = pose_in_roi(
                    frame, enhanced_roi, pose_model, pose_reference, profile, enhanced=True
                )
                rescue_quality, rescue_stats = assess_pose(rescue_kp, enhanced_roi, pose_reference)
                best = choose_better_pose(best, (rescue_kp, rescue_quality, rescue_stats, 'enhanced'))

            should_relock = bool(
                (
                    best[1] == 'BAD'
                    and (not flow_ok or consecutive_non_good >= 2)
                    and analysis_idx - last_yolo_analysis_idx >= 4
                )
                or (
                    best[1] == 'UNCERTAIN'
                    and consecutive_non_good >= 5
                    and analysis_idx - last_yolo_analysis_idx >= 12
                )
                or (
                    not flow_ok
                    and analysis_idx > 0
                    and consecutive_non_good >= 1
                    and analysis_idx - last_yolo_analysis_idx >= 4
                )
            )
            periodic_full_relock = bool(
                analysis_idx > 0
                and analysis_idx - last_full_yolo_analysis_idx >= 30
                and (
                    best[1] != 'GOOD'
                    or consecutive_non_good >= 2
                    or not flow_ok
                )
            )
            relock_accepted = False
            if should_relock or periodic_full_relock:
                tracking_started = time.perf_counter()
                if periodic_full_relock:
                    boxes, scores = detector_predict(
                        detector, frame, args.imgsz, args.conf, profile, scope='full'
                    )
                    last_full_yolo_analysis_idx = analysis_idx
                else:
                    relock_search_box = predicted_box if predicted_box is not None else propagated_box
                    boxes, scores = detector_relock_roi(
                        detector,
                        frame,
                        relock_search_box,
                        args.conf,
                        profile,
                        consecutive_non_good + 1,
                    )
                    if (
                        len(boxes) == 0
                        and consecutive_non_good >= 8
                        and analysis_idx - last_full_yolo_analysis_idx >= 20
                    ):
                        boxes, scores = detector_predict(
                            detector, frame, args.imgsz, args.conf, profile, scope='full'
                        )
                        last_full_yolo_analysis_idx = analysis_idx
                profile['tracking']['relock_yolo_calls'] += 1
                last_yolo_analysis_idx = analysis_idx
                yolo_used = True
                identity_prediction = predicted_box
                if periodic_full_relock and detector_anchor_box is not None:
                    identity_prediction = constrain_box_scale_to_anchor(
                        predicted_box if predicted_box is not None else prev_box,
                        detector_anchor_box,
                        frame.shape[:2],
                        max_scale_ratio=1.0,
                    )
                if periodic_full_relock:
                    relock_box = select_full_relock_detection(
                        frame,
                        boxes,
                        scores,
                        identity_prediction,
                        detector_anchor_box,
                        appearance_anchor,
                        appearance_recent,
                    )
                else:
                    relock_box, _, _, _ = select_detection(
                        frame,
                        boxes,
                        scores,
                        prev_box,
                        predicted_box,
                        appearance_anchor,
                        appearance_recent,
                        lost_frames + 1,
                    )
                profile['tracking']['total_s'] += float(time.perf_counter() - tracking_started)
                if relock_box is not None:
                    if int(profile['pose']['rtmpose_calls']) - call_start < args.max_pose_calls_per_analysis_frame:
                        rescue_used = True
                        relock_roi = legacy.expand_box_xyxy(
                            relock_box,
                            1.25 if legacy.box_size(relock_box) < legacy.SMALL_BOX_THRESHOLD else 1.16,
                            shift_y_ratio=-0.02,
                            frame_shape=frame.shape[:2],
                        )
                        relock_reference = None if periodic_full_relock else temporal_kp
                        rescue_kp, _, _, _ = pose_in_roi(
                            frame, relock_roi, pose_model, relock_reference, profile
                        )
                        rescue_quality, rescue_stats = assess_pose(
                            rescue_kp, relock_roi, relock_reference
                        )
                        if rescue_quality != 'BAD':
                            relock_accepted = True
                            if periodic_full_relock:
                                propagated_box = legacy.clamp_box_xyxy(
                                    relock_box, frame.shape[:2]
                                )
                                detector_anchor_box = propagated_box.copy()
                            else:
                                propagated_box = constrain_box_scale_to_anchor(
                                    relock_box,
                                    detector_anchor_box,
                                    frame.shape[:2],
                                    max_scale_ratio=1.45,
                                )
                            profile['pose']['yolo_relock_frames'] += 1
                            candidate = (
                                rescue_kp,
                                rescue_quality,
                                rescue_stats,
                                'yolo_relock_full' if periodic_full_relock else 'yolo_relock',
                            )
                            best = candidate if periodic_full_relock else choose_better_pose(best, candidate)

            best_kp, final_quality, final_stats, final_source = best
            internal_temporal_hold = None
            if best_kp is None or final_quality == 'BAD':
                internal_temporal_hold = legacy.remap_keypoints_to_box(
                    temporal_kp, propagated_box, conf_scale=0.82
                )
                if internal_temporal_hold is None:
                    internal_temporal_hold = legacy.remap_keypoints_to_box(
                        trusted_kp, propagated_box, conf_scale=0.82
                    )
                if temporal_kp is not None and consecutive_non_good < 2:
                    best_kp = np.asarray(temporal_kp, dtype=np.float32).copy()
                    best_kp[:, 2] *= 0.68
                    final_source = 'temporal_hold'
                else:
                    best_kp = np.zeros((17, 3), dtype=np.float32)
                    final_source = 'suppressed_bad_pose'
            best_kp = np.asarray(best_kp, dtype=np.float32)
            best_kp[:, 2] = np.clip(best_kp[:, 2], 0.0, 1.0)
            if final_quality in ('GOOD', 'UNCERTAIN'):
                temporal_kp = best_kp.copy()
            elif internal_temporal_hold is not None:
                temporal_kp = np.asarray(internal_temporal_hold, dtype=np.float32)
            frame_calls = int(profile['pose']['rtmpose_calls']) - call_start
            if frame_calls > args.max_pose_calls_per_analysis_frame:
                raise RuntimeError(
                    f'Pose budget exceeded at analysis frame {analysis_idx}: {frame_calls} > '
                    f'{args.max_pose_calls_per_analysis_frame}'
                )
            profile['pose']['max_calls_observed'] = max(profile['pose']['max_calls_observed'], frame_calls)
            if primary_quality == 'GOOD':
                profile['pose']['primary_pose_accepts'] += 1
            if rescue_used:
                profile['pose']['pose_rescue_frames'] += 1
            profile['pose'][f'{final_quality.lower()}_frames'] += 1
            tracking_found = bool(flow_ok or relock_accepted or final_quality == 'GOOD')
            if tracking_found:
                lost_frames = 0
                profile['tracking']['found_frames'] += 1
            else:
                lost_frames += 1
                profile['tracking']['lost_frames'] += 1
            consecutive_non_good = 0 if final_quality == 'GOOD' else consecutive_non_good + 1
            trustworthy = bool(
                final_quality == 'GOOD'
                or (
                    final_quality == 'UNCERTAIN'
                    and bool(final_stats.get('bbox_consistent', False))
                    and float(final_stats.get('temporal_score', 0.0)) >= 0.38
                )
            )
            if trustworthy and final_source != 'temporal_hold':
                updated_box = update_track_box_from_pose(propagated_box, best_kp, frame.shape[:2])
                trusted_kp = best_kp.copy()
            else:
                updated_box = propagated_box.copy()
            updated_box = constrain_box_step(
                updated_box,
                prev_box,
                frame.shape[:2],
                max_scale_ratio=1.12,
                max_center_shift_ratio=0.58,
            )
            updated_box = constrain_box_scale_to_anchor(
                updated_box,
                detector_anchor_box,
                frame.shape[:2],
                max_scale_ratio=1.45,
            )
            feature = legacy.extract_target_appearance(frame, updated_box)
            if final_quality == 'GOOD' and feature is not None:
                appearance_recent = legacy.blend_appearance_feature(appearance_recent, feature, 0.16)
                if appearance_anchor is None:
                    appearance_anchor = feature

            source_indices.append(source_idx)
            timestamps.append(float(source_idx / info.fps))
            boxes_out.append(updated_box.astype(np.float32))
            found_out.append(tracking_found)
            raw_keypoints.append(best_kp)
            pose_quality.append(final_quality)
            pose_source.append(final_source)
            yolo_used_out.append(yolo_used)
            pose_calls_out.append(frame_calls)
            rescue_used_out.append(rescue_used)
            quality_stats_out.append(final_stats)

            prev_prev_box = None if prev_box is None else prev_box.copy()
            prev_box = updated_box.copy()
            prev_gray = gray
            prev_points = points_in_box(gray, prev_box) if next_points is None or relock_accepted else next_points
            source_idx += 1
            pbar.update(1)
    cap.release()

    if len(source_indices) != len(scheduled_indices):
        # Some MOV containers over-report their decodable frame count. Retain every
        # selected frame that was actually decoded and keep its original timestamp.
        scheduled_indices = source_indices.copy()
    if not source_indices:
        raise RuntimeError('未成功解码任何 analysis frame')

    source_indices_arr = np.asarray(source_indices, dtype=np.int64)
    timestamps_arr = np.asarray(timestamps, dtype=np.float64)
    boxes_arr = np.asarray(boxes_out, dtype=np.float32)
    found_arr = np.asarray(found_out, dtype=np.bool_)
    raw_arr = np.asarray(raw_keypoints, dtype=np.float32)

    temporal_started = time.perf_counter()
    refined_arr = legacy.offline_temporal_refine(raw_arr, boxes_arr)
    refined_arr = legacy.reduce_temporal_lag(refined_arr, raw_arr, boxes_arr)
    refined_arr = legacy.repair_brief_outliers(refined_arr, raw_arr, boxes_arr)
    refined_arr = legacy.enforce_track_box_consistency(refined_arr, boxes_arr)
    profile['temporal']['total_s'] = float(time.perf_counter() - temporal_started)

    analysis_frames = len(source_indices_arr)
    processed_duration_s = float(timestamps_arr[-1] + 1.0 / info.fps) if info.fps > 0.0 else 0.0
    runtime_duration_s = processed_duration_s if args.max_analysis_frames > 0 else info.duration_s
    effective_fps = float(analysis_frames / processed_duration_s) if processed_duration_s > 0.0 else 0.0
    profile['video']['analysis_frames'] = analysis_frames
    profile['video']['effective_analysis_fps'] = effective_fps
    profile['video']['processed_duration_s'] = processed_duration_s
    profile['pose']['pose_frames_processed'] = analysis_frames
    profile['pose']['rtmpose_calls_per_analysis_frame'] = float(
        profile['pose']['rtmpose_calls'] / analysis_frames
    )
    profile['tracking']['yolo_calls_per_video_second'] = float(
        profile['tracking']['yolo_calls'] / runtime_duration_s
    ) if runtime_duration_s > 0.0 else 0.0
    profile['pose']['rtmpose_calls_per_video_second'] = float(
        profile['pose']['rtmpose_calls'] / runtime_duration_s
    ) if runtime_duration_s > 0.0 else 0.0

    tracking_payload = {
        'source_frame_index': torch.from_numpy(source_indices_arr),
        'analysis_frame_index': torch.arange(analysis_frames, dtype=torch.int64),
        'timestamp': torch.from_numpy(timestamps_arr),
        'boxes_xyxy': torch.from_numpy(boxes_arr),
        'tracking_found': torch.from_numpy(found_arr),
        'yolo_used': torch.from_numpy(np.asarray(yolo_used_out, dtype=np.bool_)),
    }
    keypoint_payload = {
        'source_frame_index': torch.from_numpy(source_indices_arr),
        'timestamp': torch.from_numpy(timestamps_arr),
        'raw_keypoints': torch.from_numpy(raw_arr),
        'keypoints': torch.from_numpy(refined_arr.astype(np.float32)),
        'track_boxes': torch.from_numpy(boxes_arr),
        'found_mask': torch.from_numpy(found_arr),
    }
    pose_sequence = {
        **tracking_payload,
        'keypoints': torch.from_numpy(refined_arr.astype(np.float32)),
        'keypoint_confidence': torch.from_numpy(refined_arr[:, :, 2].mean(axis=1).astype(np.float32)),
        'pose_quality': pose_quality,
        'pose_source': pose_source,
        'pose_calls': torch.from_numpy(np.asarray(pose_calls_out, dtype=np.int32)),
        'rescue_used': torch.from_numpy(np.asarray(rescue_used_out, dtype=np.bool_)),
        'quality_stats': quality_stats_out,
    }
    legacy.save_tensor_dict(output_dir / 'tracking_cache.pt', tracking_payload)
    legacy.save_tensor_dict(output_dir / 'keypoint_cache.pt', keypoint_payload)
    legacy.save_tensor_dict(output_dir / 'pose_sequence.pt', pose_sequence)

    render_skeleton_only(
        input_path,
        output_dir / 'overlay.mp4',
        source_indices_arr,
        refined_arr,
        boxes_arr,
        min(info.fps, args.analysis_fps),
        profile,
    )
    profile['tracker']['total_s'] = float(time.perf_counter() - total_started_at)
    profile['tracker']['real_time_factor'] = float(
        profile['tracker']['total_s'] / runtime_duration_s
    ) if runtime_duration_s > 0.0 else 0.0
    with (output_dir / 'performance_profile.json').open('w', encoding='utf-8') as handle:
        json.dump(profile, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    missing = [path for path in expected_outputs if not path.is_file() or path.stat().st_size <= 0]
    if missing:
        raise RuntimeError('缺少 Sparse Foundation 输出: ' + ', '.join(str(path) for path in missing))
    return profile


def main() -> int:
    profile = run_sparse(parse_args())
    print(json.dumps({
        'strategy': profile['foundation_strategy'],
        'analysis_frames': profile['video']['analysis_frames'],
        'effective_analysis_fps': profile['video']['effective_analysis_fps'],
        'yolo_calls': profile['tracking']['yolo_calls'],
        'rtmpose_calls': profile['pose']['rtmpose_calls'],
        'rtmpose_calls_per_analysis_frame': profile['pose']['rtmpose_calls_per_analysis_frame'],
        'total_runtime_s': profile['tracker']['total_s'],
        'real_time_factor': profile['tracker']['real_time_factor'],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
