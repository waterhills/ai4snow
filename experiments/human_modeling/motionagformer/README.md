# MotionAGFormer-XS independent audit harness

This directory validates the official MotionAGFormer-XS 2D-to-3D lifter without
importing or modifying AI4Snow Foundation or Evaluation.

The audit result is in [AUDIT.md](AUDIT.md). The pinned minimal official source
snapshot, pretrained checkpoint, local audit-only dependencies, and exported
model files are intentionally ignored by Git. Source/checkpoint provenance and
hashes are recorded in [upstream_snapshot.json](upstream_snapshot.json).

## Reproduction

The commands below use the existing `snowboard` Conda environment (Python 3.11,
PyTorch 2.10). The adapter has a self-contained fallback for the only `timm`
symbol used by XS inference.

```bash
conda run -n snowboard python test_adapter.py
conda run -n snowboard python smoke_benchmark.py --device cpu --frames 27
conda run -n snowboard python smoke_benchmark.py --device mps --frames 27
conda run -n snowboard python smoke_benchmark.py \
  --device cpu --frames 900 --batch-size 8 --warmup 2 --repeats 5
conda run -n snowboard python smoke_benchmark.py \
  --device mps --frames 900 --batch-size 4 --warmup 2 --repeats 5 \
  --portable-gcn-patch
```

ONNX and Core ML checks require the audit-only packages installed under
`_deps/` and added to `PYTHONPATH`:

```bash
PYTHONPATH=_deps conda run -n snowboard python export_onnx.py
PYTHONPATH=_deps conda run -n snowboard python export_coreml.py
```

The ONNX command passes. The Core ML command is retained as a reproducible
negative test for the converter issue recorded in the audit.
