# MotionBERT-Lite Integration Audit

Audit date: 2026-08-22  
AI4Snow branch: `model-dev`  
Scope: COCO-17 PoseSequence → H36M-17 → MotionBERT-Lite → Pose3DSequence draft  
Foundation status: read-only; no Foundation files were changed.

## Executive decision

`RECOMMEND: YES`

MotionBERT-Lite should enter the AI4Snow A/B stage as the long-context B line. The recommendation is for an experiment, not for production promotion: the official 243-frame context, pretrained noisy/partial-2D motion representation, successful M4/MPS run, and acceptable lifting time make it a credible long-sequence candidate. Actual skiing smoothness and accuracy remain unverified because this audit intentionally did not perform evaluation or connect Foundation.

## 1. Repository and weights

Prepared:

- Official source: [Walter0807/MotionBERT](https://github.com/Walter0807/MotionBERT), shallow clone at commit `705d3a95354db8bdb696b3492e47a3b5537174ff` (2026-03-14).
- Local source: `worker/ai4snow/model/human_modeling/motionbert/upstream/`.
- In-the-wild 3D checkpoint: `checkpoint/pose3d/FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin`.
- Checkpoint size: 64,099,897 bytes (61.1 MiB).
- SHA-256: `9811155371db4ca5d20f31a36a232d41012e12e1333882888a564d741861148f`, matching the [official Hugging Face file page](https://huggingface.co/walterzhu/MotionBERT/blob/main/checkpoint/pose3d/FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin).
- Config: [MB_ft_h36m_global_lite.yaml](https://github.com/Walter0807/MotionBERT/blob/main/configs/pose3d/MB_ft_h36m_global_lite.yaml): `maxlen=243`, `dim_feat=256`, `depth=5`, `num_heads=8`, `dim_rep=512`, `rootrel=False`, `no_conf=False`, `flip=True`.

No training dataset, AlphaPose, detector model, RGB pose model, mesh model, or unrelated checkpoint was downloaded. The whole local `worker/ai4snow/model/` path is already ignored by the repository, so the weight and upstream clone are not commit candidates.

## 2. License

The official code repository contains Apache License 2.0. The official Hugging Face model repository also exposes that LICENSE and does not declare a separate checkpoint license. The audit therefore treats code and checkpoint as Apache-2.0-covered artifacts, while preserving the upstream LICENSE and attribution. If AI4Snow later redistributes the binary rather than downloading it during setup, legal review should confirm that the model repository's lack of separate weight terms is acceptable.

## 3. Input contract

Confirmed model input:

```text
float32 [B, T, 17, 3]
channel 0 = x
channel 1 = y
channel 2 = 2D keypoint confidence
```

Evidence: the official [README](https://github.com/Walter0807/MotionBERT#using-motionbert-for-human-centric-video-representations) declares 17 joints and 3 channels; the global-lite config has `no_conf: False`; the H36M reader concatenates detector confidence as channel 3.

Temporal rules:

- `1 <= T <= 243`. The learned temporal embedding has length 243 and is sliced to the actual `T`.
- The official wild dataset does not pad. It returns full clips and a shorter final clip with batch size 1.
- The official wild script uses non-overlapping `clip_len=243` chunks. It does not blend boundaries.
- The official H36M fine-tuning data uses 243-frame clips with stride 81.
- MotionBERT does not ingest timestamps or FPS. AI4Snow must supply a uniformly sampled PoseSequence; irregular gaps must be repaired or segmented before lifting. At 30 FPS, 243 frames cover 8.1 seconds.

Normalization:

- Default official wild mode calls `crop_scale` on the complete detected sequence before chunking. Valid joints are those with nonzero confidence. One square scale is the maximum x/y span across the sequence; x/y are centered, mapped to `[-1,1]`, then clipped. Image width/height are not required in this mode.
- `--pixel` is a separate official mode: subtract `[width,height]/2` and divide by `min(width,height)/2`, then invert that transform on output. It requires image size.
- AI4Snow's adapter implements the default complete-sequence normalization once before sliding windows. Per-window normalization is prohibited because changing window scale/center would itself cause 3D seams.

Root definition: H36M joint 0, pelvis/root, synthesized as the mean of COCO left hip (11) and right hip (12).

## 4. Output contract and coordinates

Raw model output is `float32 [B,T,17,3]` in H36M-17 order.

For the audited global-lite checkpoint, `rootrel=False`. During training, all target z values are shifted by the first frame's root depth. The official wild script sets only `prediction[:,0,0,2] = 0`. Therefore the raw result is a normalized 2.5D camera/image proxy, not a metric world-space skeleton and not a per-frame root-relative pose.

Model-native convention retained by the adapter:

- x: image-right.
- y: image-down.
- z: H36M image/camera-depth channel in the same normalized scale.
- Scale: dimensionless until multiplied by the normalization's `scale_px / 2`; even after that it is only a pixel-proxy depth, not meters.
- The official wild code does not document a reliable world-axis or camera-extrinsic convention. Its visualizer remaps `(-x,-z,-y)` only for display.

Proposed `Pose3DSequence` conversion:

```text
timestamps           [T]
joints_3d            [T,17,3]  # each frame minus pelvis
confidence           [T,17]    # propagated 2D confidence, not calibrated 3D confidence
root                 [T,3]     # blended model-native pelvis trajectory
scale                scalar    # scale_px / 2, pixel-proxy per normalized unit
source_frame_index   [T]
```

This split avoids presenting the model's root trajectory as metric world motion while preserving it for future consumers.

## 5. COCO-17 → H36M-17 adapter

The mapping is independent of any A-line implementation. It follows OpenMMLab's official [`convert_keypoint_definition`](https://github.com/open-mmlab/mmpose/blob/main/mmpose/apis/inference_3d.py) for COCO → H36M and matches MotionBERT's H36M order.

| H36M index | Joint | COCO source/formula |
|---:|---|---|
| 0 | pelvis/root | mean(11 left_hip, 12 right_hip) |
| 1 | right_hip | 12 right_hip |
| 2 | right_knee | 14 right_knee |
| 3 | right_ankle | 16 right_ankle |
| 4 | left_hip | 11 left_hip |
| 5 | left_knee | 13 left_knee |
| 6 | left_ankle | 15 left_ankle |
| 7 | spine/belly | mean(H36M 0 pelvis, H36M 8 thorax) |
| 8 | thorax/neck | mean(5 left_shoulder, 6 right_shoulder) |
| 9 | nose | 0 nose |
| 10 | head | mean(1 left_eye, 2 right_eye) |
| 11 | left_shoulder | 5 left_shoulder |
| 12 | left_elbow | 7 left_elbow |
| 13 | left_wrist | 9 left_wrist |
| 14 | right_shoulder | 6 right_shoulder |
| 15 | right_elbow | 8 right_elbow |
| 16 | right_wrist | 10 right_wrist |

For synthesized joints, x, y, and confidence are all averaged, matching the official conversion arithmetic. This is compatible, but not ideal under one-sided occlusion; downstream skiing tests should separately examine synthesized pelvis/thorax/head behavior.

Implementation: `adapter.py`. It has no Foundation import and only depends on NumPy.

## 6. M4, CPU, MPS, and ONNX compatibility

Official environment guidance is old and CUDA-oriented (Python 3.7, CUDA 11.6). The full upstream requirements also include unrelated action/mesh packages such as `chumpy`, `smplx`, and `pytorch-metric-learning`; installing them into AI4Snow's current environment is unnecessary and risky.

Core 3D lifting uses standard PyTorch operations only. No custom CUDA kernel or CUDA-only compiled dependency is used by DSTformer. The stock `infer_wild.py` only selects CUDA or CPU and has no MPS device branch, but moving the core model and tensors to `mps` is sufficient.

Verified on this machine:

- Apple M4 MacBook Air, 10 CPU cores, 16 GB unified memory.
- Existing `snowboard` environment used read-only: Python 3.11.14, PyTorch 2.10.0.
- CPU forward: PASS.
- Apple MPS forward: PASS.
- CPU/MPS 81-frame flip-TTA maximum absolute difference: `8.34e-7`; mean: `7.51e-8`.
- No package was installed into `snowboard`.

Production recommendation: create an independent `motionbert-lite` Conda environment with a pinned modern Python/PyTorch pair, then expose lifting through a narrow process/API boundary. Do not install the upstream full `requirements.txt` into `snowboard`.

ONNX:

- Dynamic batch and temporal axes exported successfully at opset 17.
- ONNX checker: PASS.
- ONNX Runtime CPU: PASS for T = 1, 27, 81, 243; correct finite `[1,T,17,3]` outputs.
- Export size: 64,277,093 bytes.
- Scope: raw DSTformer forward only. COCO adapter, normalization, flip TTA, depth alignment, and temporal blending remain host-side logic.

## 7. Smoke test

Detector-free smoke test:

```text
deterministic synthetic COCO17 [900,17,2] + confidence [900,17]
→ H36M17 [900,17,3]
→ complete-sequence normalization
→ MotionBERT-Lite overlapping inference
→ Pose3DSequence draft
```

Results:

- Raw blended model output: `[900,17,3]`, all finite.
- `joints_3d`: `[900,17,3]`, pelvis exactly zero after root separation.
- `confidence`: `[900,17]`.
- `root`: `[900,3]`.
- `timestamps`: `[900]`.
- `source_frame_index`: `[900]`.

This proves loading, tensor contracts, device execution, long-sequence coverage, and adapter bookkeeping. Synthetic input does not establish skiing accuracy, physical correctness, or real temporal smoothness.

## 8. Long-sequence sliding-window method

Confirmed official facts:

- Maximum input length: 243.
- Wild inference: adjacent non-overlapping chunks, with the last chunk shorter.
- H36M fine-tuning clips: length 243, stride 81.

AI4Snow proposal, derived from those facts:

1. Validate uniform timestamps and one tracked subject.
2. Convert COCO17 to H36M17.
3. Normalize the complete sequence exactly once using official wild `crop_scale` semantics.
4. Use `window=243`, `stride=81`, `overlap=162`, matching official training stride rather than inventing an overlap.
5. Allow a shorter final window; do not pad or duplicate frames. For 900 frames the ten windows are `[0:243]`, `[81:324]`, ..., `[648:891]`, `[729:900]`.
6. Apply official left/right flip TTA within each window.
7. Set the first window's first-root z to zero. For each later window, compute the median pelvis-z difference over frames already covered and translate the whole window in z by that scalar. Global x/y are not translated because they share one sequence-global normalization.
8. Blend all overlapping outputs by nonzero raised-cosine weights and normalize by the accumulated weights (partition-of-unity overlap-add).
9. Split the blended result into per-frame pelvis-relative joints plus a separate root trajectory.

Why this avoids boundary jumps: predictions near window edges receive less weight, each interior frame is informed by multiple temporal contexts, and clip-specific depth offsets are aligned before averaging. This blending is an AI4Snow design, not an upstream-tested guarantee, and must later be validated on continuous turns.

## 9. M4 benchmark and 900-frame estimate

All timings include official flip TTA, i.e. two model forward passes, batch size 1, float32. Steady timing is the median of five runs after the first call.

| Device | Frames | Cold/compile (s) | Steady median (s) | Process peak RSS during test |
|---|---:|---:|---:|---:|
| CPU | 27 | 0.130 | 0.106 | 330 MB |
| CPU | 81 | 0.263 | 0.273 | 371 MB |
| CPU | 243 | 0.899 | 0.880 | 499 MB |
| MPS | 27 | 0.119 | 0.030 | 543 MB |
| MPS | 81 | 0.112 | 0.075 | 550 MB |
| MPS | 243 | 0.446 | 0.273 | 557 MB |

Additional memory/load data:

- Model parameters: 16,001,549.
- Model load: 0.185 s.
- Process RSS increase at load: about 125 MB.
- MPS current tensor allocation after 243-frame test: about 61 MB.
- MPS driver allocation snapshot after 243-frame test: about 1,139 MB. Because memory is unified, process RSS and driver allocation should not be naively added.

900-frame overlapping lifting (10 windows: nine × 243, one × 171), excluding RGB/Foundation and including tensor transfer plus blending:

- CPU measured: 8.77 s.
- MPS measured runs: approximately 2.6–4.2 s depending on shape compilation/cache state; use 4.5 s as a conservative planning estimate after model load.
- For a 30 s video this is lifting-only RTF ≈ 0.15 on MPS and ≈ 0.29 on CPU.

Conclusion: MotionBERT-Lite is not “XS” sized, but it is operationally light enough for offline M4 lifting. The 243-frame attention window is the dominant cost.

## 10. Theoretical comparison with MotionAGFormer-XS

Official [MotionAGFormer](https://github.com/TaatiTeam/MotionAGFormer) figures: XS uses 27 frames, 2.2M parameters, and 1.0G MACs. Its H36M config is per-frame root-relative. MotionBERT-Lite here uses up to 243 frames and 16.0M parameters.

Potential MotionBERT-Lite advantages for continuous skiing turns:

- Nine times the temporal context (243 vs 27 frames): about 8.1 s vs 0.9 s at 30 FPS.
- DSTformer explicitly models long-range spatial and temporal attention.
- MotionBERT pretraining reconstructs 3D motion from noisy/partial 2D observations, a plausible advantage under temporary skiing occlusion.
- The global-lite head preserves a root/depth trajectory proxy instead of forcing every frame to be root-relative.
- Sequence-to-sequence output plus velocity loss during fine-tuning is structurally aligned with smooth motion output.

Risks relative to MotionAGFormer-XS:

- 7.3× more parameters and a much more expensive temporal window; higher latency and memory.
- Non-causal 243-frame inference delays output and depends on future frames.
- Longer attention can oversmooth or propagate a bad 2D observation across more frames.
- MotionAGFormer's parallel Transformer/GCNFormer explicitly emphasizes local skeletal adjacency; XS may preserve fast local limb changes better despite shorter context.
- Global-lite root/depth is harder to stitch and is not metric world motion; XS's root-relative output is simpler.
- Neither audited checkpoint is trained on snowboarding. H36M benchmark rankings cannot establish ski-domain accuracy or stability.
- No official apples-to-apples MotionBERT-Lite vs MotionAGFormer-XS checkpoint comparison was found. Full MotionBERT numbers must not be presented as Lite numbers.

The central A/B hypothesis is therefore narrow: MotionBERT-Lite should reduce long-turn temporal jitter and seam sensitivity at acceptable M4 cost, while MotionAGFormer-XS may win on compactness, latency, and local articulation. It remains a hypothesis until a later authorized evaluation stage.

## 11. Final recommendation

```text
RECOMMEND:
YES
```

Enter MotionBERT-Lite into AI4Snow A/B as the long-context B candidate with these gates before production:

1. Consume only Foundation COCO17 PoseSequence; never invoke RGB detection/2D pose.
2. Enforce uniform temporal sampling and the explicit COCO→H36M adapter.
3. Use complete-sequence normalization, 243/81 windows, depth alignment, and weighted overlap-add.
4. Preserve native coordinate/scale metadata; do not label output as meters or world coordinates.
5. Run future skiing-specific stability/accuracy evaluation before choosing a default model.

## Reproduction files

- `adapter.py`: independent skeleton, normalization, sliding-window, blending, and Pose3DSequence draft adapters.
- `smoke_benchmark.py`: detector-free official-checkpoint smoke and M4 benchmark.
- `tests/test_adapter.py`: five passing adapter/window tests.
- `artifacts/smoke_benchmark.json`: full measured environment/timing/memory output.
- `artifacts/onnx_audit.json`: isolated ONNX export/runtime result.
