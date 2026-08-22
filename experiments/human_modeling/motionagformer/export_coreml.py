"""Best-effort static-27-frame Core ML conversion check."""

from __future__ import annotations

import argparse
from pathlib import Path

import coremltools as ct
import numpy as np
import torch

from adapter import DEFAULT_CHECKPOINT, load_motionagformer_xs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default=str(DEFAULT_CHECKPOINT))
    parser.add_argument("--output", type=Path, default=Path("artifacts/motionagformer_xs.mlpackage"))
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    model = load_motionagformer_xs(args.checkpoint, device="cpu")
    example = torch.zeros((1, 27, 17, 3), dtype=torch.float32)
    traced = torch.jit.trace(model, example, strict=True)
    with torch.inference_mode():
        reference = model(example).numpy()
        traced_output = traced(example).numpy()
    if not np.allclose(reference, traced_output, rtol=1e-4, atol=1e-5):
        raise RuntimeError("TorchScript trace does not match eager output")

    mlmodel = ct.convert(
        traced,
        inputs=[ct.TensorType(name="pose_2d", shape=example.shape, dtype=np.float32)],
        outputs=[ct.TensorType(name="pose_3d", dtype=np.float32)],
        minimum_deployment_target=ct.target.macOS13,
        convert_to="mlprogram",
        compute_precision=ct.precision.FLOAT32,
    )
    mlmodel.save(args.output)
    print(f"coreml_export: PASS path={args.output}")
    print(f"input_shape={tuple(example.shape)} output_shape={tuple(reference.shape)}")


if __name__ == "__main__":
    main()

