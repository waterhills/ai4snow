"""Dependency-light contract tests for the independent adapter."""

from __future__ import annotations

import numpy as np

from adapter import build_lifter_input, coco17_to_h36m17, normalize_screen_coordinates


def main() -> None:
    keypoints = np.arange(2 * 17 * 2, dtype=np.float32).reshape(2, 17, 2)
    confidence = np.linspace(0.1, 0.9, 2 * 17, dtype=np.float32).reshape(2, 17)
    h36m, h36m_confidence = coco17_to_h36m17(keypoints, confidence)
    assert h36m.shape == (2, 17, 2)
    assert h36m_confidence.shape == (2, 17)
    assert np.allclose(h36m[:, 1], keypoints[:, 12])  # right hip
    assert np.allclose(h36m[:, 4], keypoints[:, 11])  # left hip
    assert np.allclose(h36m[:, 0], 0.5 * (keypoints[:, 11] + keypoints[:, 12]))
    assert np.allclose(h36m[:, 11], keypoints[:, 5])  # left shoulder
    assert np.allclose(h36m[:, 16], keypoints[:, 10])  # right wrist

    corners = np.array([[[0.0, 0.0], [1920.0, 1080.0]]], dtype=np.float32)
    normalized = normalize_screen_coordinates(corners, width=1920, height=1080)
    assert np.allclose(normalized[0, 0], [-1.0, -0.5625])
    assert np.allclose(normalized[0, 1], [1.0, 0.5625])

    lifter_input, adapted_confidence = build_lifter_input(
        keypoints, confidence, width=1920, height=1080
    )
    assert lifter_input.shape == (2, 17, 3)
    assert np.allclose(lifter_input[..., 2], adapted_confidence)
    print("adapter_contract_test: PASS")


if __name__ == "__main__":
    main()

