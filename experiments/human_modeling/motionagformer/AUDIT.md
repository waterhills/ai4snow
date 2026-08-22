# MotionAGFormer-XS Integration Audit

Audit date: 2026-08-22  
Project branch: `model-dev`  
Scope: independent 2D-to-3D lifting only; AI4Snow Foundation and Evaluation were not imported or modified.

## Executive result

MotionAGFormer-XS is operationally compatible with AI4Snow's planned
`PoseSequence`: official H36M weights load, CPU and MPS inference pass on the M4,
the direct input/output contract is small, and 900 frames take about one second
without flip test-time augmentation. It is not yet scientifically validated for
skiing, RTMPose input, occlusion, loose clothing, or in-the-wild camera motion.
Its monocular output is root-relative and non-metric, so it cannot supply an
absolute 3D root position.

**RECOMMEND: MAYBE**

Use it as the first integration candidate and baseline, but do not declare it
the production primary lifter until a held-out skiing sequence audit checks
limb orientation, left/right stability, clip-boundary continuity, occlusion,
and downstream metric usefulness.

## 1. Official code and weights

- Official repository: [TaatiTeam/MotionAGFormer](https://github.com/TaatiTeam/MotionAGFormer)
- Audited minimal upstream source snapshot at commit:
  `4756fd1eb7cc73f0e991f091ff2280e030ab85f3`
  (`README updated`, 2024-03-10 Asia/Shanghai).
- Paper: [MotionAGFormer, WACV 2024](https://openaccess.thecvf.com/content/WACV2024/html/Mehraban_MotionAGFormer_Enhancing_3D_Human_Pose_Estimation_With_a_Transformer-GCNFormer_Network_WACV_2024_paper.html)
- Variant: H36M MotionAGFormer-XS, 27 frames, advertised as 2.2M parameters and
  1.0G MACs per clip.
- Measured parameter count: `2,241,531`.
- Official H36M checkpoint downloaded from the XS link in the official README:
  `27,809,069` bytes; SHA-256
  `7abb32ea4a4bc1f675e2580f7b5aeb7c3bf9add46cfe4a770b18fb0cfcf64597`.
- The checkpoint includes model, optimizer, epoch, learning rate, minimum MPJPE,
  and W&B state. Runtime needs only `checkpoint["model"]`; the stored keys have
  a `module.` prefix from `DataParallel`.
- No H36M/MPI-INF-3DHP dataset, YOLO weight, or HRNet weight was downloaded.
- `upstream_snapshot.json` records the pinned repository, commit, official
  source-file hashes, checkpoint source ID, size, and checksum.
- `_official/`, `_deps/`, `weights/`, ONNX, and Core ML artifacts are covered by
  the local `.gitignore`; `git check-ignore` verified the checkpoint is ignored.

Preparation status: **complete**.

## 2. License

The official repository is Apache License 2.0. It permits commercial use,
modification, and redistribution subject to license/notice, attribution, and
modified-file notice requirements. The official download page does not publish
a separate checkpoint license notice; before redistributing the pretrained
weights in a commercial package, confirm that the repository license is intended
to cover that binary artifact and retain the upstream license/attribution.

## 3. Architecture

XS uses:

- input linear embedding `3 -> 64` and a learned 17-joint positional embedding;
- 12 MotionAGFormer blocks;
- per block, a spatial-then-temporal attention branch and a
  spatial-then-temporal GCNFormer branch;
- adaptive fusion between the two branches;
- residual MLPs and layer normalization;
- a `64 -> 512` tanh representation head and `512 -> 3` joint head.

The graph uses the fixed H36M kinematic adjacency spatially and a learned
top-k similarity graph temporally (`neighbour_num=2`). There is no custom C++ or
CUDA extension.

## 4. Exact input and output contract

### Input

```text
float32 [B, 27, 17, 3]
                 |  |--- C = (normalized x, normalized y, confidence)
                 |------ J = H36M17 order
------------------------ T = exactly 27 for the XS checkpoint
```

- Confidence **is part of the input**, as channel 2. If unavailable, upstream
  training code fills it with 1; AI4Snow should preserve RTMPose confidence.
- Image width and height are **not model inputs**, but are required by the
  adapter to normalize full-frame pixel coordinates:

  ```text
  x_norm = 2*x/W - 1
  y_norm = 2*y/W - H/W
  ```

  Thus x is in `[-1,1]`; y is in `[-H/W,H/W]`, not independently forced to
  `[-1,1]`. This preserves aspect ratio.
- Use original full-frame width/height. If pose coordinates are ROI-local, first
  return them to full-frame pixel coordinates. Do not normalize by the tracked
  bounding box.
- Bbox and camera parameters are not consumed by the model.
- No input root subtraction or body-scale normalization is applied. The config's
  `root_rel: True` applies to 3D training/evaluation targets, not 2D input.
- Missing values must be finite. Keep low-confidence coordinates/interpolation
  from Foundation and express uncertainty through the confidence channel; do not
  send NaN.

### Output

```text
float32 [B, 27, 17, 3]
```

The model predicts all 27 frames, not only a center frame. The raw coordinates
follow the H36M camera/image-scale training convention. Official evaluation
explicitly sets joint 0 (pelvis) to zero; the audit adapter subtracts the
predicted pelvis from all joints. Without camera calibration and a scale/factor,
the result is **root-relative and non-metric**. It is not an absolute world-space
trajectory and is not directly in meters or millimeters.

The pretrained XS graph is tied to 27 temporal nodes. A different sequence
length requires a correspondingly instantiated/trained configuration; arbitrary
T should not be passed to this checkpoint.

## 5. COCO17 to H36M17 adapter

The implementation in `adapter.py` matches the official in-the-wild
`demo/lib/preprocess.py` formulas. A parity test against the upstream function
passed (maximum float32 keypoint difference `1.22e-4`, confidence difference 0).

| H36M index | H36M joint | COCO source / construction | Confidence |
|---:|---|---|---|
| 0 | pelvis | midpoint(left_hip 11, right_hip 12) | mean(11,12) |
| 1 | right_hip | right_hip 12 | conf 12 |
| 2 | right_knee | right_knee 14 | conf 14 |
| 3 | right_ankle | right_ankle 16 | conf 16 |
| 4 | left_hip | left_hip 11 | conf 11 |
| 5 | left_knee | left_knee 13 | conf 13 |
| 6 | left_ankle | left_ankle 15 | conf 15 |
| 7 | spine/belly | four-way mean of shoulders and hips, then official x adjustment relative to pelvis/thorax | mean(pelvis,thorax) |
| 8 | thorax | shoulder midpoint moved one-third toward nose, then official eye/nose y adjustment | mean(shoulders) |
| 9 | nose | COCO nose 0, nudged one-quarter toward shoulder midpoint | conf 0 |
| 10 | head | x = mean(eyes+ears); y = left_eye_y + right_eye_y - nose_y | mean(eyes+ears) |
| 11 | left_shoulder | left_shoulder 5 | conf 5 |
| 12 | left_elbow | left_elbow 7 | conf 7 |
| 13 | left_wrist | left_wrist 9 | conf 9 |
| 14 | right_shoulder | right_shoulder 6 | conf 6 |
| 15 | right_elbow | right_elbow 8 | conf 8 |
| 16 | right_wrist | right_wrist 10 | conf 10 |

The head/spine/thorax rules are heuristics, not observed COCO joints. Ski goggles,
helmet, pole occlusion, and crouched posture are likely domain-shift risks.

## 6. Custom/in-the-wild inference

The official video demo is not directly reusable for AI4Snow because it:

- runs YOLOv3 + HRNet before lifting;
- hard-codes MotionAGFormer-Base (`T=243`), CUDA, and `DataParallel`;
- partitions video into 243-frame clips, screen-normalizes, performs horizontal
  flip test-time augmentation, then zeros the pelvis.

The correct AI4Snow route is to bypass `get_pose2D` completely. For XS, adapt the
already tracked COCO17 sequence, partition it into exact 27-frame clips, edge-pad
only the final clip, batch the clips, optionally perform flip augmentation, and
trim padding. The audit harness uses non-overlapping clips like the official
demo's partitioning strategy. This is fast but creates a potential discontinuity
every 27 frames; an overlap/blend option should be quality-tested later.

## 7. Apple Silicon, CUDA-only code, ONNX, and Core ML

### CPU and MPS

- CPU inference: **PASS**.
- MPS inference using the upstream GCN path with no compatibility patch under
  PyTorch 2.10.0: **PASS**.
- No custom CUDA op exists. CUDA-only assumptions are confined mainly to the
  official training/demo entrypoints (`.cuda()`, `DataParallel`) and old-style
  GCN device helpers using `get_device()`/integer device IDs.
- The independent loader does not use the official demo/training entrypoint.
- An opt-in two-function device-hardening patch creates graph tensors directly
  on `adj.device` and moves static adjacency to the parameter device. It is not
  required for correctness in this audited PyTorch version, but reduced MPS
  overhead in the batched benchmark and is a small fallback for older releases.

### ONNX

Static 27-frame export: **PASS**.

- input/output: `[batch,27,17,3]`;
- ONNX opset 17;
- batch axis dynamic, temporal and joint axes fixed;
- `onnx.checker.check_model`: PASS;
- exported size: `9,787,071` bytes;
- SHA-256:
  `e322f0a1a09868f9db2b27e8094da4399d4c4a6e12f25b3ba9f840acaac6fc8c`.

This confirms graph exportability, not ONNX Runtime numerical/performance parity.

### Core ML

Current direct conversion: **not ready**. The recommended Apple workflow is to
capture a PyTorch graph with `torch.jit.trace` or `torch.export`, then use
Core ML Tools' Unified Conversion API. The TorchScript trace itself matched eager
PyTorch, but Core ML Tools 9.0 conversion failed at an `int` op with
`TypeError: only 0-dimensional arrays can be converted to Python scalars`.
Core ML Tools also warned that PyTorch 2.10 is untested and PyTorch 2.7 is the
latest tested version. A future task should pin a supported Torch/CoreMLTools
matrix and, if needed, rewrite/decompose the offending graph operation before
claiming Core ML support.

## 8. Smoke test

Smoke input was a smooth, artificial, finite COCO17 sequence in 1920x1080 pixel
coordinates with non-uniform confidence. It exercised:

```text
COCO17 + confidence
-> official-formula H36M17 adapter
-> official screen normalization
-> official XS architecture + official H36M checkpoint
-> [T,17,3] root-relative output
```

Results:

- adapter contract test: PASS;
- upstream adapter parity: PASS;
- CPU official-weight forward: PASS;
- MPS official-weight forward: PASS;
- output shape `[27,17,3]`, finite values, zero pelvis after postprocess: PASS.

This proves execution and interface compatibility only. Artificial input cannot
establish 3D accuracy or skiing-domain validity.

## 9. M4 performance benchmark

Hardware/software: Apple M4, arm64, macOS 26.3.1, Python 3.11.14, PyTorch 2.10.0.
Input: 900 synthetic analysis frames at 30 FPS, 34 exact 27-frame clips with
edge padding on the last clip. Values below are medians; model load is separate.

| Device/config | Batch | Flip TTA | Model load | 900-frame lifting | Throughput | Approx memory observation |
|---|---:|---:|---:|---:|---:|---|
| CPU, upstream GCN | 8 | no | 0.082 s | **1.029 s** | 874 fps | process peak RSS 322 MiB |
| MPS, hardened GCN | 4 | no | 0.273 s | **0.771 s** | 1,168 fps | process peak RSS 307 MiB; Metal driver allocated 75 MiB after run |
| CPU, upstream GCN | 8 | yes | 0.081 s | **2.072 s** | 434 fps | process peak RSS 335 MiB |
| MPS, hardened GCN | 8 | yes | 0.264 s | **1.443 s** | 624 fps | process peak RSS 307 MiB; Metal driver allocated 75 MiB after run |

MPS can reach 0.635 s at batch 34, but Metal driver allocation rose to about
1.10 GiB, so batch 4 is the safer default. Memory readings are process peak RSS
and post-run MPS allocations, not a precisely sampled per-operation peak.

For a 30-second, 30-FPS video:

- warm CPU lifting adds about **1.03 s**; cold start including load about 1.11 s;
- warm MPS lifting adds about **0.77 s**; cold start including load about 1.04 s;
- flip TTA adds about **1.44-2.07 s** warm, depending on device.

Therefore the lifter itself is not a minutes-scale bottleneck. Adapter/window
construction overhead is included; detection, pose estimation, and I/O are not.

## 10. Proposed `Pose3DSequence` conversion

```text
timestamps        [T]       pass through unchanged
joints_3d         [T,17,3]  H36M order; subtract pelvis; non-metric camera-oriented units
joint_confidence  [T,17]    adapted/propagated 2D confidence, not 3D uncertainty
root_position     null       monocular lifter cannot recover global 3D translation
body_scale        scalar     robust median of torso/shoulder/hip lengths in model units
source_frame_index[T]       pass through unchanged
```

Add explicit metadata:

```text
coordinate_system = camera_oriented_root_relative_nonmetric
joint_convention  = h36m17
confidence_semantics = propagated_2d_confidence
root_position_available = false
model_id = motionagformer-xs-h36m
clip_length = 27
```

If the eventual schema forbids a null root position, store a zero `[T,3]` array
only together with `root_position_available=false`; do not misrepresent zero as
an observed camera/world trajectory. Preserve the unscaled raw relative output
and `body_scale` so later evaluation can choose whether to normalize.

## 11. Future Foundation hookup

No Foundation change is made in this audit. The future boundary should be:

```text
Foundation PoseSequence
  -> validate finite [T,17,2], [T,17], [T], full-frame image size
  -> COCO17 to H36M17 + constructed confidence
  -> full-frame screen normalization
  -> exact 27-frame partition/pad and batching
  -> MotionAGFormer-XS forward (optional flip TTA)
  -> subtract pelvis, trim padding
  -> Pose3DSequence + explicit coordinate/confidence metadata
```

`bbox` remains available for validation/quality logic but is not a lifter input.
Timestamps and source indices must never be regenerated after windowing.

Before production selection, run at least:

1. real Foundation/RTMPose sequences without re-detection;
2. front/side/rear skiing, crouch, pole occlusion, jumps, and turns;
3. clip-boundary velocity/acceleration checks at frames 26/27;
4. left/right swap and depth-sign checks;
5. comparison with a second lifter or limited annotated/triangulated evidence;
6. downstream robustness with and without flip TTA and overlap blending.

## 12. Final recommendation

Operational readiness is strong: official artifacts are prepared, the adapter is
small, M4 CPU/MPS execution passes, ONNX export passes, and 900-frame lifting is
about one second. Scientific readiness is not established: H36M is an indoor
domain, the checkpoint was trained around a different 2D detector distribution,
constructed torso/head joints are heuristic, and monocular scale/root translation
are unavailable.

**RECOMMEND: MAYBE**
