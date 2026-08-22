"""Run a detector-free MotionBERT-Lite smoke test and M4 benchmark.

The script generates a deterministic COCO-17 motion sequence, applies the
standalone adapter, and directly feeds the official 3D pose checkpoint.  It
does not import or execute AI4Snow Foundation, detection, or 2D pose code.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import statistics
import sys
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np
import psutil
import torch

from adapter import (
    coco17_to_h36m17,
    infer_sliding_windows,
    normalize_motionbert_wild,
    pack_coco17,
    to_pose3d_sequence_draft,
)


HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parents[3]
DEFAULT_UPSTREAM = (
    PROJECT_ROOT / "worker/ai4snow/model/human_modeling/motionbert/upstream"
)
DEFAULT_CHECKPOINT = (
    DEFAULT_UPSTREAM
    / "checkpoint/pose3d/FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin"
)
DEFAULT_OUTPUT = HERE / "artifacts/smoke_benchmark.json"

LEFT_JOINTS = (4, 5, 6, 11, 12, 13)
RIGHT_JOINTS = (1, 2, 3, 14, 15, 16)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def synthetic_coco17(frame_count: int) -> tuple[np.ndarray, np.ndarray]:
    """Create an articulated, periodic 2D sequence for interface validation."""

    base = np.array(
        [
            [960, 250], [935, 235], [985, 235], [915, 245], [1005, 245],
            [880, 370], [1040, 370], [830, 510], [1090, 510], [800, 650],
            [1120, 650], [905, 650], [1015, 650], [900, 830], [1020, 830],
            [895, 1010], [1025, 1010],
        ],
        dtype=np.float32,
    )
    phase = np.linspace(0.0, 6.0 * np.pi, frame_count, dtype=np.float32)
    xy = np.repeat(base[None, :, :], frame_count, axis=0)
    xy[..., 0] += 120.0 * np.sin(phase)[:, None]
    xy[..., 1] += 18.0 * np.sin(phase * 2.0)[:, None]
    xy[:, [9, 13, 15], 0] -= 28.0 * np.sin(phase * 2.0)[:, None]
    xy[:, [10, 14, 16], 0] += 28.0 * np.sin(phase * 2.0)[:, None]
    confidence = np.full((frame_count, 17), 0.95, dtype=np.float32)
    return xy, confidence


def flip_h36m_tensor(data: torch.Tensor) -> torch.Tensor:
    result = data.clone()
    result[..., 0] *= -1
    result[..., LEFT_JOINTS + RIGHT_JOINTS, :] = result[
        ..., RIGHT_JOINTS + LEFT_JOINTS, :
    ]
    return result


def load_model(upstream: Path, checkpoint_path: Path) -> tuple[torch.nn.Module, float]:
    sys.path.insert(0, str(upstream))
    from lib.model.DSTformer import DSTformer

    started = time.perf_counter()
    model = DSTformer(
        dim_in=3,
        dim_out=3,
        dim_feat=256,
        dim_rep=512,
        depth=5,
        num_heads=8,
        mlp_ratio=4,
        num_joints=17,
        maxlen=243,
    )
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    state_dict = {
        name.removeprefix("module."): value
        for name, value in checkpoint["model_pos"].items()
    }
    model.load_state_dict(state_dict, strict=True)
    model.eval()
    return model, time.perf_counter() - started


def synchronize(device: str) -> None:
    if device == "mps":
        torch.mps.synchronize()


def infer_tta(model: torch.nn.Module, batch: torch.Tensor) -> torch.Tensor:
    prediction = model(batch)
    prediction_flip = flip_h36m_tensor(model(flip_h36m_tensor(batch)))
    return (prediction + prediction_flip) / 2.0


def benchmark_shape(
    model: torch.nn.Module,
    input_numpy: np.ndarray,
    device: str,
    repeats: int,
) -> dict[str, Any]:
    process = psutil.Process(os.getpid())
    model.to(device)
    batch = torch.from_numpy(input_numpy[None]).to(device)
    rss_samples_mb: list[float] = []
    sampler_stop = threading.Event()

    def sample_rss() -> None:
        while not sampler_stop.wait(0.005):
            rss_samples_mb.append(process.memory_info().rss / (1024**2))

    sampler = threading.Thread(target=sample_rss, daemon=True)
    sampler.start()

    try:
        with torch.inference_mode():
            synchronize(device)
            cold_started = time.perf_counter()
            cold_output = infer_tta(model, batch)
            synchronize(device)
            cold_seconds = time.perf_counter() - cold_started

            timings = []
            for _ in range(repeats):
                started = time.perf_counter()
                output = infer_tta(model, batch)
                synchronize(device)
                timings.append(time.perf_counter() - started)
    finally:
        sampler_stop.set()
        sampler.join()

    result: dict[str, Any] = {
        "frames": int(input_numpy.shape[0]),
        "output_shape": list(output.shape),
        "cold_seconds": cold_seconds,
        "steady_seconds_median": statistics.median(timings),
        "steady_seconds_min": min(timings),
        "steady_seconds_max": max(timings),
        "repeats": repeats,
        "finite": bool(torch.isfinite(output).all().cpu()),
        "rss_mb_after": process.memory_info().rss / (1024**2),
        "peak_rss_mb_during_benchmark": max(
            rss_samples_mb, default=process.memory_info().rss / (1024**2)
        ),
    }
    if device == "mps":
        result.update(
            {
                "mps_current_allocated_mb": torch.mps.current_allocated_memory()
                / (1024**2),
                "mps_driver_allocated_mb": torch.mps.driver_allocated_memory()
                / (1024**2),
                "mps_recommended_max_mb": torch.mps.recommended_max_memory()
                / (1024**2),
            }
        )
    del batch, output, cold_output
    model.to("cpu")
    if device == "mps":
        torch.mps.empty_cache()
    return result


def compare_cpu_mps(model: torch.nn.Module, input_numpy: np.ndarray) -> dict[str, float]:
    batch_cpu = torch.from_numpy(input_numpy[None])
    with torch.inference_mode():
        model.to("cpu")
        output_cpu = infer_tta(model, batch_cpu)
        model.to("mps")
        output_mps = infer_tta(model, batch_cpu.to("mps"))
        torch.mps.synchronize()
        difference = (output_cpu - output_mps.cpu()).abs()
    model.to("cpu")
    torch.mps.empty_cache()
    return {
        "frames": int(input_numpy.shape[0]),
        "max_abs": float(difference.max()),
        "mean_abs": float(difference.mean()),
    }


def run_long_sequence(
    model: torch.nn.Module,
    normalized: np.ndarray,
    device: str,
) -> tuple[np.ndarray, tuple[slice, ...], float]:
    model.to(device)

    def infer_window(batch_numpy: np.ndarray) -> np.ndarray:
        batch = torch.from_numpy(batch_numpy).to(device)
        with torch.inference_mode():
            output = infer_tta(model, batch)
        synchronize(device)
        return output.cpu().numpy()

    started = time.perf_counter()
    blended, clips = infer_sliding_windows(
        normalized, infer_window, window=243, stride=81, align_depth=True
    )
    elapsed = time.perf_counter() - started
    model.to("cpu")
    if device == "mps":
        torch.mps.empty_cache()
    return blended, clips, elapsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--upstream", type=Path, default=DEFAULT_UPSTREAM)
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--repeats", type=int, default=5)
    args = parser.parse_args()

    if not args.checkpoint.is_file():
        raise FileNotFoundError(args.checkpoint)
    process = psutil.Process(os.getpid())
    rss_before = process.memory_info().rss / (1024**2)
    model, load_seconds = load_model(args.upstream.resolve(), args.checkpoint.resolve())
    rss_after_model = process.memory_info().rss / (1024**2)

    xy_900, confidence_900 = synthetic_coco17(900)
    h36m_900 = coco17_to_h36m17(pack_coco17(xy_900, confidence_900))
    normalized_900, normalization = normalize_motionbert_wild(h36m_900)

    devices = ["cpu"]
    if torch.backends.mps.is_available():
        devices.append("mps")

    benchmarks: dict[str, list[dict[str, Any]]] = {}
    for device in devices:
        benchmarks[device] = []
        for frames in (27, 81, 243):
            benchmarks[device].append(
                benchmark_shape(
                    model, normalized_900[:frames], device, max(1, args.repeats)
                )
            )

    numerical_consistency = None
    if "mps" in devices:
        numerical_consistency = compare_cpu_mps(model, normalized_900[:81])

    long_runs: dict[str, Any] = {}
    smoke_blended: np.ndarray | None = None
    smoke_clips: tuple[slice, ...] = ()
    for device in devices:
        blended, clips, elapsed = run_long_sequence(model, normalized_900, device)
        long_runs[device] = {
            "frames": 900,
            "seconds": elapsed,
            "window": 243,
            "stride": 81,
            "overlap": 162,
            "window_count": len(clips),
            "window_lengths": [clip.stop - clip.start for clip in clips],
            "coverage_last_frame": clips[-1].stop == 900,
            "finite": bool(np.isfinite(blended).all()),
        }
        if device == devices[-1]:
            smoke_blended, smoke_clips = blended, clips

    assert smoke_blended is not None
    result_3d = to_pose3d_sequence_draft(
        smoke_blended,
        h36m_900[..., 2],
        timestamps=np.arange(900, dtype=np.float64) / 30.0,
        source_frame_index=np.arange(900, dtype=np.int64),
        normalization=normalization,
    )

    report = {
        "environment": {
            "platform": platform.platform(),
            "machine": platform.machine(),
            "python": platform.python_version(),
            "torch": torch.__version__,
            "mps_built": torch.backends.mps.is_built(),
            "mps_available": torch.backends.mps.is_available(),
        },
        "checkpoint": {
            "path": str(args.checkpoint.resolve()),
            "bytes": args.checkpoint.stat().st_size,
            "sha256": sha256(args.checkpoint),
        },
        "model": {
            "parameters": sum(parameter.numel() for parameter in model.parameters()),
            "load_seconds": load_seconds,
            "rss_mb_before_load": rss_before,
            "rss_mb_after_load": rss_after_model,
            "rss_model_delta_mb": rss_after_model - rss_before,
        },
        "benchmark_official_flip_tta": benchmarks,
        "cpu_mps_numerical_consistency": numerical_consistency,
        "long_sequence": long_runs,
        "smoke_test": {
            "input_source": "deterministic synthetic COCO17; no RGB/detector/2D pose",
            "packed_input_shape": [1, 900, 17, 3],
            "packed_channel_meaning": ["x_normalized", "y_normalized", "confidence"],
            "raw_model_output_shape": list(smoke_blended.shape),
            "pose3d_joints_shape": list(result_3d.joints_3d.shape),
            "pose3d_confidence_shape": list(result_3d.confidence.shape),
            "pose3d_root_shape": list(result_3d.root.shape),
            "timestamps_shape": list(result_3d.timestamps.shape),
            "source_frame_index_shape": list(result_3d.source_frame_index.shape),
            "pelvis_relative_zero_max_abs": float(
                np.abs(result_3d.joints_3d[:, 0]).max()
            ),
            "normalization_center_xy_px": normalization.center_xy_px.tolist(),
            "normalization_scale_px": normalization.scale_px,
            "output_scale_normalized_unit_px": result_3d.scale,
            "coordinate_convention": result_3d.coordinate_convention,
            "window_slices": [[clip.start, clip.stop] for clip in smoke_clips],
            "finite": bool(
                np.isfinite(result_3d.joints_3d).all()
                and np.isfinite(result_3d.root).all()
            ),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
