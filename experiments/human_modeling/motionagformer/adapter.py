"""Independent MotionAGFormer-XS adapter for the AI4Snow integration audit.

This module deliberately does not import or modify AI4Snow Foundation code.
It loads the official model implementation from ``_official/``. A small,
opt-in device-hardening patch is available for older PyTorch/MPS releases; the
audited PyTorch 2.10 environment runs the upstream GCN path without it.
"""

from __future__ import annotations

import importlib
import math
import sys
import types
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn


EXPERIMENT_DIR = Path(__file__).resolve().parent
DEFAULT_UPSTREAM_DIR = EXPERIMENT_DIR / "_official" / "MotionAGFormer"
DEFAULT_CHECKPOINT = EXPERIMENT_DIR / "weights" / "motionagformer-xs-h36m.pth.tr"

COCO17_NAMES = (
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
)

H36M17_NAMES = (
    "pelvis", "right_hip", "right_knee", "right_ankle", "left_hip",
    "left_knee", "left_ankle", "spine", "thorax", "nose", "head",
    "left_shoulder", "left_elbow", "left_wrist", "right_shoulder",
    "right_elbow", "right_wrist",
)

H36M_LEFT = (4, 5, 6, 11, 12, 13)
H36M_RIGHT = (1, 2, 3, 14, 15, 16)

XS_CONFIG: dict[str, Any] = {
    "n_layers": 12,
    "dim_in": 3,
    "dim_feat": 64,
    "dim_rep": 512,
    "dim_out": 3,
    "mlp_ratio": 4,
    "act_layer": nn.GELU,
    "attn_drop": 0.0,
    "drop": 0.0,
    "drop_path": 0.0,
    "use_layer_scale": True,
    "layer_scale_init_value": 1e-5,
    "use_adaptive_fusion": True,
    "num_heads": 8,
    "qkv_bias": False,
    "qkv_scale": None,
    "hierarchical": False,
    "num_joints": 17,
    "use_temporal_similarity": True,
    "temporal_connection_len": 1,
    "use_tcn": False,
    "graph_only": False,
    "neighbour_num": 2,
    "n_frames": 27,
}


@dataclass(frozen=True)
class Pose3DSequenceDesign:
    """Proposed boundary object for a future Foundation integration.

    ``joint_confidence`` is propagated 2D evidence, not a calibrated 3D
    uncertainty. MotionAGFormer cannot recover metric global translation from
    monocular 2D input, so ``root_position`` is intentionally unavailable.
    """

    timestamps: np.ndarray
    joints_3d: np.ndarray
    joint_confidence: np.ndarray
    root_position: None
    body_scale: float
    source_frame_index: np.ndarray
    coordinate_system: str = "camera_oriented_root_relative_nonmetric"
    confidence_semantics: str = "propagated_2d_confidence"


def _validate_coco_inputs(keypoints: np.ndarray, confidence: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    keypoints = np.asarray(keypoints, dtype=np.float32)
    confidence = np.asarray(confidence, dtype=np.float32)
    if keypoints.ndim != 3 or keypoints.shape[1:] != (17, 2):
        raise ValueError(f"keypoints must have shape [T,17,2], got {keypoints.shape}")
    if confidence.shape != keypoints.shape[:2]:
        raise ValueError(f"confidence must have shape [T,17], got {confidence.shape}")
    if not np.isfinite(keypoints).all():
        raise ValueError("keypoints contain NaN or infinity")
    if not np.isfinite(confidence).all():
        raise ValueError("confidence contains NaN or infinity")
    return keypoints, np.clip(confidence, 0.0, 1.0)


def coco17_to_h36m17(
    keypoints: np.ndarray,
    confidence: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Convert COCO17 to the H36M17 convention used by the official demo.

    The constructed joint formulas intentionally follow
    ``demo/lib/preprocess.py`` from the official repository, including its
    in-the-wild head, thorax, pelvis, and spine heuristics.
    """

    coco, coco_conf = _validate_coco_inputs(keypoints, confidence)
    t = coco.shape[0]
    h36m = np.zeros((t, 17, 2), dtype=np.float32)
    h36m_conf = np.zeros((t, 17), dtype=np.float32)

    # Direct COCO -> H36M assignments.
    direct = {
        9: 0,
        11: 5,
        14: 6,
        12: 7,
        15: 8,
        13: 9,
        16: 10,
        4: 11,
        1: 12,
        5: 13,
        2: 14,
        6: 15,
        3: 16,
    }
    for h36m_index, coco_index in direct.items():
        h36m[:, h36m_index] = coco[:, coco_index]
        h36m_conf[:, h36m_index] = coco_conf[:, coco_index]

    shoulder_mid = 0.5 * (coco[:, 5] + coco[:, 6])
    hip_mid = 0.5 * (coco[:, 11] + coco[:, 12])

    # Pelvis/root.
    h36m[:, 0] = hip_mid
    h36m_conf[:, 0] = np.mean(coco_conf[:, [11, 12]], axis=1)

    # Thorax heuristic used by the official video demo.
    thorax = shoulder_mid + (coco[:, 0] - shoulder_mid) / 3.0
    thorax[:, 1] -= (
        np.mean(coco[:, [1, 2], 1], axis=1) - coco[:, 0, 1]
    ) * (2.0 / 3.0)
    h36m[:, 8] = thorax
    h36m_conf[:, 8] = np.mean(coco_conf[:, [5, 6]], axis=1)

    # Spine/belly heuristic used by demo/lib/preprocess.py. The initial point
    # is the four-way torso mean; x is then extrapolated away from the
    # pelvis-thorax midpoint exactly as upstream does.
    spine = np.mean(coco[:, [5, 6, 11, 12]], axis=1)
    spine[:, 0] += 2.0 * (spine[:, 0] - np.mean(np.stack((hip_mid[:, 0], thorax[:, 0]), axis=1), axis=1))
    h36m[:, 7] = spine
    h36m_conf[:, 7] = np.mean(h36m_conf[:, [0, 8]], axis=1)

    # Head uses the eye/ear centroid in x and an extrapolated eye/nose y.
    head = np.empty((t, 2), dtype=np.float32)
    head[:, 0] = np.mean(coco[:, 1:5, 0], axis=1)
    head[:, 1] = coco[:, 1, 1] + coco[:, 2, 1] - coco[:, 0, 1]
    h36m[:, 10] = head
    h36m_conf[:, 10] = np.mean(coco_conf[:, [1, 2, 3, 4]], axis=1)

    # Upstream nudges the H36M nose toward the shoulder midpoint.
    h36m[:, 9] -= (h36m[:, 9] - shoulder_mid) / 4.0

    return h36m, h36m_conf


def normalize_screen_coordinates(keypoints: np.ndarray, width: float, height: float) -> np.ndarray:
    """Apply the official width-preserving screen normalization.

    x maps to [-1, 1]. y maps to [-height/width, height/width], preserving
    image aspect ratio rather than independently scaling x and y.
    """

    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")
    keypoints = np.asarray(keypoints, dtype=np.float32)
    if keypoints.shape[-1] != 2:
        raise ValueError(f"last keypoint dimension must be 2, got {keypoints.shape}")
    return keypoints / float(width) * 2.0 - np.array([1.0, height / width], dtype=np.float32)


def build_lifter_input(
    coco_keypoints: np.ndarray,
    coco_confidence: np.ndarray,
    width: float,
    height: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Return model input [T,17,3] and adapted H36M confidence [T,17]."""

    h36m, h36m_conf = coco17_to_h36m17(coco_keypoints, coco_confidence)
    normalized = normalize_screen_coordinates(h36m, width, height)
    model_input = np.concatenate((normalized, h36m_conf[..., None]), axis=-1)
    return model_input.astype(np.float32), h36m_conf


def flip_h36m(data: torch.Tensor) -> torch.Tensor:
    """Horizontal flip and left/right swap for [B,T,17,C]."""

    result = data.clone()
    result[..., 0] *= -1
    source = result.clone()
    result[..., list(H36M_LEFT), :] = source[..., list(H36M_RIGHT), :]
    result[..., list(H36M_RIGHT), :] = source[..., list(H36M_LEFT), :]
    return result


def _ensure_timm_drop_path_import() -> None:
    """Provide the sole timm symbol upstream imports when timm is unavailable.

    XS inference config has drop_path=0, so the upstream model instantiates an
    Identity and never calls this fallback. The implementation remains correct
    for non-zero probabilities to keep the import self-contained.
    """

    try:
        importlib.import_module("timm.models.layers")
        return
    except Exception:
        pass

    class DropPath(nn.Module):
        def __init__(self, drop_prob: float = 0.0) -> None:
            super().__init__()
            self.drop_prob = float(drop_prob)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            if self.drop_prob == 0.0 or not self.training:
                return x
            keep_prob = 1.0 - self.drop_prob
            shape = (x.shape[0],) + (1,) * (x.ndim - 1)
            random_tensor = keep_prob + torch.rand(shape, dtype=x.dtype, device=x.device)
            return x * random_tensor.floor() / keep_prob

    timm_module = types.ModuleType("timm")
    models_module = types.ModuleType("timm.models")
    layers_module = types.ModuleType("timm.models.layers")
    layers_module.DropPath = DropPath
    timm_module.models = models_module
    models_module.layers = layers_module
    sys.modules.update({
        "timm": timm_module,
        "timm.models": models_module,
        "timm.models.layers": layers_module,
    })


def _apply_portable_gcn_patch(gcn_class: type[nn.Module]) -> None:
    """Replace two CUDA-specific device helpers with device-agnostic forms."""

    @staticmethod
    def normalize_digraph(adj: torch.Tensor) -> torch.Tensor:
        batch, nodes, _ = adj.shape
        degrees = adj.detach().sum(dim=-1)
        inv_sqrt = degrees.clamp_min(torch.finfo(adj.dtype).eps).pow(-0.5)
        degree_matrix = torch.eye(nodes, dtype=adj.dtype, device=adj.device)
        degree_matrix = degree_matrix.view(1, nodes, nodes) * inv_sqrt.view(batch, nodes, 1)
        return torch.bmm(torch.bmm(degree_matrix, adj), degree_matrix)

    def move_adj(self: nn.Module, adj: torch.Tensor) -> torch.Tensor:
        return adj.to(device=self.V.weight.device, dtype=self.V.weight.dtype)

    gcn_class.normalize_digraph = normalize_digraph
    # Preserve the upstream method name so its forward path stays unchanged.
    gcn_class.change_adj_device_to_cuda = move_adj


def resolve_device(requested: str = "auto") -> torch.device:
    if requested == "auto":
        if torch.backends.mps.is_available():
            return torch.device("mps")
        if torch.cuda.is_available():
            return torch.device("cuda")
        return torch.device("cpu")
    device = torch.device(requested)
    if device.type == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("MPS was requested but is unavailable")
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is unavailable")
    return device


def load_motionagformer_xs(
    checkpoint_path: Path | str = DEFAULT_CHECKPOINT,
    upstream_dir: Path | str = DEFAULT_UPSTREAM_DIR,
    device: str | torch.device = "cpu",
    portable_gcn_patch: bool = False,
) -> nn.Module:
    """Load official MotionAGFormer-XS code and official H36M checkpoint."""

    checkpoint_path = Path(checkpoint_path).resolve()
    upstream_dir = Path(upstream_dir).resolve()
    if not checkpoint_path.is_file():
        raise FileNotFoundError(checkpoint_path)
    if not (upstream_dir / "model" / "MotionAGFormer.py").is_file():
        raise FileNotFoundError(upstream_dir / "model" / "MotionAGFormer.py")

    _ensure_timm_drop_path_import()
    upstream_string = str(upstream_dir)
    if upstream_string not in sys.path:
        sys.path.insert(0, upstream_string)

    model_module = importlib.import_module("model.MotionAGFormer")
    graph_module = importlib.import_module("model.modules.graph")
    if portable_gcn_patch:
        _apply_portable_gcn_patch(graph_module.GCN)

    model = model_module.MotionAGFormer(**XS_CONFIG)
    # This checkpoint is an official trusted artifact and includes optimizer
    # state, which requires weights_only=False on recent PyTorch releases.
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    state = checkpoint["model"]
    clean_state = OrderedDict(
        (key.removeprefix("module."), value) for key, value in state.items()
    )
    model.load_state_dict(clean_state, strict=True)
    model.eval()
    return model.to(device)


def _pad_and_partition(sequence: np.ndarray, clip_length: int = 27) -> tuple[np.ndarray, int]:
    sequence = np.asarray(sequence, dtype=np.float32)
    if sequence.ndim != 3 or sequence.shape[1:] != (17, 3):
        raise ValueError(f"sequence must have shape [T,17,3], got {sequence.shape}")
    if sequence.shape[0] == 0:
        raise ValueError("sequence must contain at least one frame")
    padding = (-sequence.shape[0]) % clip_length
    if padding:
        sequence = np.concatenate((sequence, np.repeat(sequence[-1:], padding, axis=0)), axis=0)
    return sequence.reshape(-1, clip_length, 17, 3), padding


@torch.inference_mode()
def lift_sequence(
    model: nn.Module,
    sequence: np.ndarray,
    device: str | torch.device,
    batch_size: int = 8,
    flip_augmentation: bool = False,
) -> np.ndarray:
    """Lift a full [T,17,3] sequence using exact 27-frame XS clips."""

    if batch_size < 1:
        raise ValueError("batch_size must be >= 1")
    clips, padding = _pad_and_partition(sequence, XS_CONFIG["n_frames"])
    target_device = torch.device(device)
    outputs: list[torch.Tensor] = []
    for start in range(0, len(clips), batch_size):
        batch = torch.from_numpy(clips[start:start + batch_size]).to(target_device)
        prediction = model(batch)
        if flip_augmentation:
            prediction = 0.5 * (prediction + flip_h36m(model(flip_h36m(batch))))
        # The H36M XS checkpoint is trained/evaluated root-relative. Match the
        # official evaluation path by explicitly zeroing the pelvis.
        prediction = prediction - prediction[..., 0:1, :]
        outputs.append(prediction.cpu())
    result = torch.cat(outputs, dim=0).reshape(-1, 17, 3).numpy()
    if padding:
        result = result[:-padding]
    return result.astype(np.float32, copy=False)


def estimate_body_scale(joints_3d: np.ndarray) -> float:
    """Return a robust torso scale in model output units."""

    joints = np.asarray(joints_3d, dtype=np.float32)
    torso = np.linalg.norm(joints[:, 8] - joints[:, 0], axis=-1)
    shoulders = np.linalg.norm(joints[:, 11] - joints[:, 14], axis=-1)
    hips = np.linalg.norm(joints[:, 4] - joints[:, 1], axis=-1)
    valid = np.concatenate((torso[torso > 0], shoulders[shoulders > 0], hips[hips > 0]))
    return float(np.median(valid)) if valid.size else math.nan


def to_pose3d_sequence_design(
    joints_3d: np.ndarray,
    h36m_confidence: np.ndarray,
    timestamps: np.ndarray,
    source_frame_index: np.ndarray,
) -> Pose3DSequenceDesign:
    """Build the proposed future boundary object without touching Foundation."""

    joints = np.asarray(joints_3d, dtype=np.float32)
    confidence = np.asarray(h36m_confidence, dtype=np.float32)
    timestamps = np.asarray(timestamps, dtype=np.float64)
    source_frame_index = np.asarray(source_frame_index, dtype=np.int64)
    t = joints.shape[0]
    if joints.shape != (t, 17, 3) or confidence.shape != (t, 17):
        raise ValueError("joints/confidence shape mismatch")
    if timestamps.shape != (t,) or source_frame_index.shape != (t,):
        raise ValueError("timestamps/source_frame_index shape mismatch")
    root_relative = joints - joints[:, 0:1]
    return Pose3DSequenceDesign(
        timestamps=timestamps,
        joints_3d=root_relative,
        joint_confidence=confidence,
        root_position=None,
        body_scale=estimate_body_scale(root_relative),
        source_frame_index=source_frame_index,
    )
