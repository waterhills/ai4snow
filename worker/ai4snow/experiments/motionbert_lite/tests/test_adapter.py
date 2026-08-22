import unittest

import numpy as np

from adapter import (
    coco17_to_h36m17,
    infer_sliding_windows,
    normalize_motionbert_wild,
    pack_coco17,
    sliding_window_slices,
    to_pose3d_sequence_draft,
)


class AdapterTest(unittest.TestCase):
    def setUp(self):
        xy = np.arange(2 * 17 * 2, dtype=np.float32).reshape(2, 17, 2)
        confidence = np.ones((2, 17), dtype=np.float32)
        self.coco = pack_coco17(xy, confidence)

    def test_exact_joint_mapping(self):
        h36m = coco17_to_h36m17(self.coco)
        np.testing.assert_allclose(h36m[:, 0], (self.coco[:, 11] + self.coco[:, 12]) / 2)
        np.testing.assert_allclose(h36m[:, 8], (self.coco[:, 5] + self.coco[:, 6]) / 2)
        np.testing.assert_allclose(h36m[:, 7], (h36m[:, 0] + h36m[:, 8]) / 2)
        np.testing.assert_allclose(h36m[:, 10], (self.coco[:, 1] + self.coco[:, 2]) / 2)
        np.testing.assert_allclose(h36m[:, 3], self.coco[:, 16])
        np.testing.assert_allclose(h36m[:, 13], self.coco[:, 9])

    def test_official_normalization_is_sequence_global(self):
        normalized, params = normalize_motionbert_wild(coco17_to_h36m17(self.coco))
        self.assertEqual(normalized.shape, (2, 17, 3))
        self.assertLessEqual(float(np.abs(normalized[..., :2]).max()), 1.0)
        self.assertGreater(params.scale_px, 0.0)

    def test_900_frame_plan_covers_every_frame(self):
        clips = sliding_window_slices(900, window=243, stride=81)
        self.assertEqual(len(clips), 10)
        self.assertEqual((clips[0].start, clips[0].stop), (0, 243))
        self.assertEqual((clips[-1].start, clips[-1].stop), (729, 900))
        coverage = np.zeros(900, dtype=np.int32)
        for clip in clips:
            coverage[clip] += 1
        self.assertTrue(np.all(coverage > 0))

    def test_overlap_depth_alignment_removes_clip_offset(self):
        motion = np.zeros((900, 17, 3), dtype=np.float32)
        motion[..., 2] = 1.0
        call = 0

        def infer_window(x):
            nonlocal call
            output = np.zeros_like(x)
            output[..., 2] = call * 10.0
            call += 1
            return output

        blended, _ = infer_sliding_windows(motion, infer_window)
        np.testing.assert_allclose(blended[..., 2], 0.0, atol=1e-5)

    def test_output_is_pelvis_relative_with_separate_root(self):
        h36m = coco17_to_h36m17(self.coco)
        _, params = normalize_motionbert_wild(h36m)
        output = np.arange(2 * 17 * 3, dtype=np.float32).reshape(2, 17, 3)
        result = to_pose3d_sequence_draft(
            output,
            h36m[..., 2],
            timestamps=(0.0, 1.0 / 30.0),
            source_frame_index=(0, 1),
            normalization=params,
        )
        np.testing.assert_allclose(result.joints_3d[:, 0], 0.0)
        np.testing.assert_allclose(result.root, output[:, 0])


if __name__ == "__main__":
    unittest.main()
