"""Smoke test and benchmark for official MotionAGFormer-XS weights."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import resource
import time
from pathlib import Path

import numpy as np
import torch

from adapter import (
    DEFAULT_CHECKPOINT,
    H36M17_NAMES,
    build_lifter_input,
    lift_sequence,
    load_motionagformer_xs,
    resolve_device,
    to_pose3d_sequence_design,
)


def synthetic_coco17(frames: int, width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    """Create a smooth, valid COCO17 sequence in pixel coordinates."""

    base = np.array([
        [0.50, 0.18], [0.485, 0.17], [0.515, 0.17], [0.47, 0.18], [0.53, 0.18],
        [0.44, 0.30], [0.56, 0.30], [0.40, 0.43], [0.60, 0.43],
        [0.37, 0.56], [0.63, 0.56], [0.46, 0.54], [0.54, 0.54],
        [0.44, 0.72], [0.56, 0.72], [0.42, 0.91], [0.58, 0.91],
    ], dtype=np.float32)
    phase = np.linspace(0.0, 6.0 * np.pi, frames, dtype=np.float32)
    keypoints = np.repeat(base[None], frames, axis=0)
    keypoints[..., 0] += 0.04 * np.sin(phase)[:, None]
    keypoints[:, [9, 10, 15, 16], 1] += 0.025 * np.sin(phase * 1.7)[:, None]
    keypoints[..., 0] *= width
    keypoints[..., 1] *= height
    confidence = np.full((frames, 17), 0.95, dtype=np.float32)
    confidence[:, [3, 4]] = 0.80
    return keypoints, confidence


def synchronize(device: torch.device) -> None:
    if device.type == "mps":
        torch.mps.synchronize()
    elif device.type == "cuda":
        torch.cuda.synchronize(device)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def benchmark(args: argparse.Namespace) -> dict[str, object]:
    device = resolve_device(args.device)
    checkpoint = Path(args.checkpoint).resolve()
    coco, coco_confidence = synthetic_coco17(args.frames, args.width, args.height)
    model_input, h36m_confidence = build_lifter_input(
        coco, coco_confidence, args.width, args.height
    )

    load_start = time.perf_counter()
    model = load_motionagformer_xs(
        checkpoint_path=checkpoint,
        device=device,
        portable_gcn_patch=args.portable_gcn_patch,
    )
    synchronize(device)
    load_seconds = time.perf_counter() - load_start
    parameters = sum(parameter.numel() for parameter in model.parameters())

    for _ in range(args.warmup):
        warm_frames = min(args.frames, 27 * args.batch_size)
        lift_sequence(
            model,
            model_input[:warm_frames],
            device,
            batch_size=args.batch_size,
            flip_augmentation=args.flip_augmentation,
        )
    synchronize(device)

    timings: list[float] = []
    output = None
    for _ in range(args.repeats):
        start = time.perf_counter()
        output = lift_sequence(
            model,
            model_input,
            device,
            batch_size=args.batch_size,
            flip_augmentation=args.flip_augmentation,
        )
        synchronize(device)
        timings.append(time.perf_counter() - start)

    assert output is not None
    assert output.shape == (args.frames, 17, 3)
    assert np.isfinite(output).all()
    assert np.allclose(output[:, 0], 0.0, atol=1e-6)
    timestamps = np.arange(args.frames, dtype=np.float64) / args.fps
    designed = to_pose3d_sequence_design(
        output,
        h36m_confidence,
        timestamps,
        np.arange(args.frames, dtype=np.int64),
    )
    elapsed = float(np.median(timings))
    rss_bytes = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    result: dict[str, object] = {
        "smoke_test": "PASS",
        "platform": platform.platform(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "torch_version": torch.__version__,
        "device_requested": args.device,
        "device": str(device),
        "mps_built": torch.backends.mps.is_built(),
        "mps_available": torch.backends.mps.is_available(),
        "checkpoint": str(checkpoint),
        "checkpoint_bytes": checkpoint.stat().st_size,
        "checkpoint_sha256": sha256(checkpoint),
        "parameter_count": parameters,
        "input_shape": [1, 27, 17, 3],
        "output_shape": [1, 27, 17, 3],
        "sequence_frames": args.frames,
        "clip_frames": 27,
        "clip_count": (args.frames + 26) // 27,
        "batch_size": args.batch_size,
        "flip_augmentation": args.flip_augmentation,
        "portable_gcn_patch": args.portable_gcn_patch,
        "model_load_seconds": load_seconds,
        "inference_seconds_samples": timings,
        "inference_seconds_median": elapsed,
        "analysis_frames_per_second": args.frames / elapsed,
        "real_time_factor_at_input_fps": (args.frames / args.fps) / elapsed,
        "estimated_seconds_for_900_frames": elapsed * 900.0 / args.frames,
        "process_peak_rss_bytes": rss_bytes,
        "output_min": float(output.min()),
        "output_max": float(output.max()),
        "output_mean_abs": float(np.abs(output).mean()),
        "body_scale_model_units": designed.body_scale,
        "joint_order": list(H36M17_NAMES),
        "root_position_available": designed.root_position is not None,
        "coordinate_system": designed.coordinate_system,
        "confidence_semantics": designed.confidence_semantics,
    }
    if device.type == "mps":
        result["mps_current_allocated_bytes"] = int(torch.mps.current_allocated_memory())
        result["mps_driver_allocated_bytes"] = int(torch.mps.driver_allocated_memory())
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", default="auto", choices=("auto", "cpu", "mps", "cuda"))
    parser.add_argument("--frames", type=int, default=27)
    parser.add_argument("--fps", type=float, default=30.0)
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--flip-augmentation", action="store_true")
    parser.add_argument("--portable-gcn-patch", action="store_true")
    parser.add_argument("--checkpoint", default=str(DEFAULT_CHECKPOINT))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.frames < 1 or args.repeats < 1 or args.warmup < 0:
        parser.error("frames/repeats must be positive and warmup must be non-negative")
    result = benchmark(args)
    rendered = json.dumps(result, indent=2, ensure_ascii=False)
    print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
