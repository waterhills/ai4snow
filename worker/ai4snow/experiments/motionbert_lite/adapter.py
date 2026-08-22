"""Standalone AI4Snow adapters for a MotionBERT-Lite integration audit.

This module deliberately has no dependency on ``ai4snow.foundation``.  It
accepts array-like COCO-17 pose sequences and only depends on NumPy.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable

import numpy as np


COCO17_JOINTS = (
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
)

H36M17_JOINTS = (
    "pelvis",
    "right_hip",
    "right_knee",
    "right_ankle",
    "left_hip",
    "left_knee",
    "left_ankle",
    "spine",
    "thorax",
    "nose",
    "head",
    "left_shoulder",
    "left_elbow",
    "left_wrist",
    "right_shoulder",
    "right_elbow",
    "right_wrist",
)


@dataclass(frozen=True, slots=True)
class MotionBERTNormalization:
    """Parameters of MotionBERT's deterministic wild-sequence crop_scale."""

    center_xy_px: np.ndarray
    scale_px: float

    @property
    def normalized_unit_px(self) -> float:
        """Pixel-proxy length represented by one model-native output unit."""

        return self.scale_px / 2.0

    def normalize_xy(self, xy_px: np.ndarray) -> np.ndarray:
        return np.clip(
            (np.asarray(xy_px, dtype=np.float32) - self.center_xy_px)
            / self.normalized_unit_px,
            -1.0,
            1.0,
        )

    def denormalize_xy(self, xy_normalized: np.ndarray) -> np.ndarray:
        return (
            np.asarray(xy_normalized, dtype=np.float32)
            * self.normalized_unit_px
            + self.center_xy_px
        )


@dataclass(frozen=True, slots=True)
class Pose3DSequenceDraft:
    """Proposed lifting output without importing or changing Foundation."""

    timestamps: np.ndarray
    joints_3d: np.ndarray
    confidence: np.ndarray
    root: np.ndarray
    scale: float
    source_frame_index: np.ndarray
    coordinate_convention: str = (
        "MotionBERT native normalized camera/image proxy: x right, y down, "
        "z H36M image-depth; joints_3d is pelvis-relative per frame"
    )


def pack_coco17(
    keypoints_xy: np.ndarray, keypoint_confidence: np.ndarray
) -> np.ndarray:
    """Pack Foundation-like separate arrays into ``[..., 17, (x,y,conf)]``."""

    xy = np.asarray(keypoints_xy, dtype=np.float32)
    confidence = np.asarray(keypoint_confidence, dtype=np.float32)
    if xy.ndim < 2 or xy.shape[-2:] != (17, 2):
        raise ValueError(f"keypoints_xy must end in [17,2], got {xy.shape}")
    if confidence.shape != xy.shape[:-1]:
        raise ValueError(
            "keypoint_confidence must match keypoints_xy without the final "
            f"coordinate axis, got {confidence.shape} vs {xy.shape}"
        )
    if not np.isfinite(xy).all() or not np.isfinite(confidence).all():
        raise ValueError("COCO-17 pose contains NaN or infinity")
    return np.concatenate(
        [xy, np.clip(confidence, 0.0, 1.0)[..., None]], axis=-1
    ).astype(np.float32, copy=False)


def coco17_to_h36m17(coco17: np.ndarray) -> np.ndarray:
    """Convert COCO-17 to the 17-joint order used by MotionBERT.

    The coordinate and confidence arithmetic follows OpenMMLab's official
    COCO-to-H36M pose-lifter conversion: synthesized joints average all input
    channels, so the third channel remains a confidence score.
    """

    x = np.asarray(coco17, dtype=np.float32)
    if x.ndim < 2 or x.shape[-2:] != (17, 3):
        raise ValueError(f"coco17 must end in [17,3], got {x.shape}")
    if not np.isfinite(x).all():
        raise ValueError("COCO-17 pose contains NaN or infinity")

    y = np.zeros_like(x)
    y[..., 0, :] = (x[..., 11, :] + x[..., 12, :]) / 2.0  # pelvis
    y[..., 8, :] = (x[..., 5, :] + x[..., 6, :]) / 2.0  # thorax
    y[..., 7, :] = (y[..., 0, :] + y[..., 8, :]) / 2.0  # spine
    y[..., 10, :] = (x[..., 1, :] + x[..., 2, :]) / 2.0  # head

    h36m_indices = (1, 2, 3, 4, 5, 6, 9, 11, 12, 13, 14, 15, 16)
    coco_indices = (12, 14, 16, 11, 13, 15, 0, 5, 7, 9, 6, 8, 10)
    y[..., h36m_indices, :] = x[..., coco_indices, :]
    y[..., 2] = np.clip(y[..., 2], 0.0, 1.0)
    return y


def normalize_motionbert_wild(
    h36m17: np.ndarray,
) -> tuple[np.ndarray, MotionBERTNormalization]:
    """Normalize a complete sequence once using official wild crop_scale.

    Normalizing before windowing is important: independently normalizing each
    overlapping window changes its translation and scale and creates artificial
    discontinuities in the lifted sequence.
    """

    motion = np.asarray(h36m17, dtype=np.float32)
    if motion.ndim != 3 or motion.shape[1:] != (17, 3):
        raise ValueError(f"h36m17 must have shape [T,17,3], got {motion.shape}")
    if len(motion) == 0:
        raise ValueError("pose sequence is empty")

    valid = motion[..., 2] > 0.0
    valid_xy = motion[..., :2][valid]
    if len(valid_xy) < 4:
        raise ValueError("fewer than four valid keypoints in the sequence")
    xy_min = valid_xy.min(axis=0)
    xy_max = valid_xy.max(axis=0)
    scale_px = float(np.max(xy_max - xy_min))
    if not np.isfinite(scale_px) or scale_px <= 0.0:
        raise ValueError("pose sequence has zero or invalid spatial extent")

    normalization = MotionBERTNormalization(
        center_xy_px=((xy_min + xy_max) / 2.0).astype(np.float32),
        scale_px=scale_px,
    )
    result = motion.copy()
    result[..., :2] = normalization.normalize_xy(result[..., :2])
    result[..., 2] = np.clip(result[..., 2], 0.0, 1.0)
    return result, normalization


def sliding_window_slices(
    frame_count: int, *, window: int = 243, stride: int = 81
) -> tuple[slice, ...]:
    """Cover every frame with official-sized, overlapping variable clips."""

    if frame_count <= 0:
        raise ValueError("frame_count must be positive")
    if window <= 0 or window > 243:
        raise ValueError("window must be in [1,243]")
    if stride <= 0 or stride > window:
        raise ValueError("stride must be in [1,window]")

    clips: list[slice] = []
    start = 0
    while True:
        stop = min(start + window, frame_count)
        clips.append(slice(start, stop))
        if stop == frame_count:
            break
        start += stride
    return tuple(clips)


def raised_cosine_weights(length: int, *, floor: float = 1e-3) -> np.ndarray:
    """Return nonzero Hann weights for normalized overlap-add blending."""

    if length <= 0:
        raise ValueError("length must be positive")
    if not 0.0 < floor <= 1.0:
        raise ValueError("floor must be in (0,1]")
    phase = (np.arange(length, dtype=np.float64) + 0.5) / length
    weights = np.sin(np.pi * phase) ** 2
    return np.maximum(weights, floor).astype(np.float32)


def infer_sliding_windows(
    normalized_h36m17: np.ndarray,
    infer_window: Callable[[np.ndarray], np.ndarray],
    *,
    window: int = 243,
    stride: int = 81,
    align_depth: bool = True,
) -> tuple[np.ndarray, tuple[slice, ...]]:
    """Infer and blend a long sequence with robust overlap depth alignment.

    ``infer_window`` receives ``[1,L,17,3]`` and must return
    ``[1,L,17,3]``.  Global x/y are left untouched.  Later windows receive a
    scalar z translation based on the median pelvis difference in their valid
    overlap, compensating for each clip's first-root depth reference.
    """

    motion = np.asarray(normalized_h36m17, dtype=np.float32)
    if motion.ndim != 3 or motion.shape[1:] != (17, 3):
        raise ValueError(
            f"normalized_h36m17 must have shape [T,17,3], got {motion.shape}"
        )

    clips = sliding_window_slices(len(motion), window=window, stride=stride)
    weighted_sum = np.zeros((len(motion), 17, 3), dtype=np.float64)
    weight_sum = np.zeros(len(motion), dtype=np.float64)

    for clip_index, clip in enumerate(clips):
        prediction = np.asarray(infer_window(motion[None, clip]), dtype=np.float32)
        expected = (1, clip.stop - clip.start, 17, 3)
        if prediction.shape != expected:
            raise ValueError(
                f"infer_window returned {prediction.shape}, expected {expected}"
            )
        prediction = prediction[0].copy()
        if not np.isfinite(prediction).all():
            raise ValueError(f"non-finite model output in clip {clip_index}")

        existing = weight_sum[clip] > 0.0
        if align_depth and np.any(existing):
            current_blend = weighted_sum[clip][existing] / weight_sum[clip][
                existing, None, None
            ]
            delta_z = np.median(
                current_blend[:, 0, 2] - prediction[existing, 0, 2]
            )
            prediction[..., 2] += float(delta_z)
        elif align_depth:
            prediction[..., 2] -= prediction[0, 0, 2]

        weights = raised_cosine_weights(len(prediction)).astype(np.float64)
        weighted_sum[clip] += prediction * weights[:, None, None]
        weight_sum[clip] += weights

    if np.any(weight_sum <= 0.0):
        raise RuntimeError("sliding-window plan left uncovered frames")
    blended = weighted_sum / weight_sum[:, None, None]
    return blended.astype(np.float32), clips


def to_pose3d_sequence_draft(
    blended_model_output: np.ndarray,
    h36m_confidence: np.ndarray,
    *,
    timestamps: Iterable[float],
    source_frame_index: Iterable[int],
    normalization: MotionBERTNormalization,
) -> Pose3DSequenceDraft:
    """Build the proposed AI4Snow result with root and relative joints split."""

    output = np.asarray(blended_model_output, dtype=np.float32)
    confidence = np.asarray(h36m_confidence, dtype=np.float32)
    timestamps_array = np.asarray(tuple(timestamps), dtype=np.float64)
    source_index_array = np.asarray(tuple(source_frame_index), dtype=np.int64)
    if output.ndim != 3 or output.shape[1:] != (17, 3):
        raise ValueError(f"model output must have shape [T,17,3], got {output.shape}")
    if confidence.shape != output.shape[:2]:
        raise ValueError("confidence must have shape [T,17]")
    if len(timestamps_array) != len(output) or len(source_index_array) != len(output):
        raise ValueError("timestamps/source_frame_index length does not match output")

    root = output[:, 0, :].copy()
    joints_relative = output - root[:, None, :]
    return Pose3DSequenceDraft(
        timestamps=timestamps_array,
        joints_3d=joints_relative,
        confidence=np.clip(confidence, 0.0, 1.0),
        root=root,
        scale=normalization.normalized_unit_px,
        source_frame_index=source_index_array,
    )
