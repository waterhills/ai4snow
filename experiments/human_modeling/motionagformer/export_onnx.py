"""Static-27-frame ONNX export check for MotionAGFormer-XS."""

from __future__ import annotations

import argparse
from pathlib import Path

import onnx
import torch

from adapter import DEFAULT_CHECKPOINT, load_motionagformer_xs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default=str(DEFAULT_CHECKPOINT))
    parser.add_argument("--output", type=Path, default=Path("artifacts/motionagformer_xs.onnx"))
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    model = load_motionagformer_xs(args.checkpoint, device="cpu")
    example = torch.zeros((1, 27, 17, 3), dtype=torch.float32)
    with torch.inference_mode():
        expected = model(example)
    torch.onnx.export(
        model,
        example,
        args.output,
        input_names=("pose_2d",),
        output_names=("pose_3d",),
        dynamic_axes={"pose_2d": {0: "batch"}, "pose_3d": {0: "batch"}},
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    graph = onnx.load(args.output)
    onnx.checker.check_model(graph)
    print(f"onnx_export: PASS path={args.output} bytes={args.output.stat().st_size}")
    print(f"input_shape={tuple(example.shape)} output_shape={tuple(expected.shape)} opset=17")


if __name__ == "__main__":
    main()

