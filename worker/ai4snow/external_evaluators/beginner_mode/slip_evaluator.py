import math
import statistics
from typing import Dict, List, Any
from ..base_evaluator import BaseExternalEvaluator

# COCO-17 Mapping for reference
COCO_MAPPING = {
    5: 'left_shoulder', 6: 'right_shoulder',
    9: 'left_wrist', 10: 'right_wrist',
    11: 'left_hip', 12: 'right_hip',
    13: 'left_knee', 14: 'right_knee',
    15: 'left_ankle', 16: 'right_ankle'
}

def extract_keypoint(frame_kps, kp_name: str) -> Dict[str, float]:
    """Helper to safely extract keypoint from list or dict formats"""
    # If already dict of dicts: {'left_hip': {'x': 1, 'y': 2, 'conf': 0.9}}
    if isinstance(frame_kps, dict) and kp_name in frame_kps:
        val = frame_kps[kp_name]
        return {'x': float(val.get('x', 0)), 'y': float(val.get('y', 0)), 'conf': float(val.get('conf', 0))}
    
    # If it's a raw COCO array [17, 2/3]
    if isinstance(frame_kps, (list, tuple)):
        # find index
        idx = -1
        for k, v in COCO_MAPPING.items():
            if v == kp_name:
                idx = k
                break
        if idx >= 0 and len(frame_kps) > idx:
            kp = frame_kps[idx]
            if len(kp) >= 2:
                conf = float(kp[2]) if len(kp) > 2 else 1.0
                return {'x': float(kp[0]), 'y': float(kp[1]), 'conf': conf}
    
    return {'x': 0.0, 'y': 0.0, 'conf': 0.0}

def dist_2d(p1: Dict[str, float], p2: Dict[str, float]) -> float:
    return math.hypot(p1['x'] - p2['x'], p1['y'] - p2['y'])

class SlipEvaluator(BaseExternalEvaluator):
    """
    推坡 (Slip) 在外层旁路机制的独立算子
    支持前刃推坡 ('toe_slip') 和 后刃推坡 ('heel_slip')
    """
    def __init__(self, mode: str, action: str):
        super().__init__(mode, action)
        self.min_conf = 0.25

    def evaluate(self, keypoints_data: Any) -> Dict[str, Any]:
        frames = keypoints_data
        # Handle dict wrapping {'keypoints': [...]}
        if isinstance(keypoints_data, dict) and 'keypoints' in keypoints_data:
            frames = keypoints_data['keypoints']
            
        # Convert torch tensor to list if necessary
        if hasattr(frames, 'tolist'):
            frames = frames.tolist()

        if not isinstance(frames, (list, tuple)) or len(frames) == 0:
            return {"status": "error", "message": "Invalid or empty keypoint data"}

        total_frames = len(frames)
        valid_frames = 0
        offsets = []
        knee_bend_ratios = []
        arm_spans = []
        
        for frame in frames:
            # 1. 提取所需重点点
            l_hip = extract_keypoint(frame, 'left_hip')
            r_hip = extract_keypoint(frame, 'right_hip')
            l_ankle = extract_keypoint(frame, 'left_ankle')
            r_ankle = extract_keypoint(frame, 'right_ankle')
            l_wrist = extract_keypoint(frame, 'left_wrist')
            r_wrist = extract_keypoint(frame, 'right_wrist')
            l_sh = extract_keypoint(frame, 'left_shoulder')
            r_sh = extract_keypoint(frame, 'right_shoulder')
            
            # 基础置信度门槛
            if min([l_hip['conf'], r_hip['conf'], l_ankle['conf'], r_ankle['conf']]) < self.min_conf:
                continue

            valid_frames += 1
            
            # 2. 重心居中度计算: 检查骨盆与脚踝中线的 X 轴水平偏差
            pelvis_x = (l_hip['x'] + r_hip['x']) / 2.0
            ankle_mid_x = (l_ankle['x'] + r_ankle['x']) / 2.0
            stance_width = max(10.0, abs(l_ankle['x'] - r_ankle['x']))
            # 标准化偏差（取偏差相对两脚间距的比例）
            offset_ratio = abs(pelvis_x - ankle_mid_x) / stance_width
            offsets.append(offset_ratio)
            
            # 3. 双臂舒展度 (张手保持平衡)
            wrist_dist = dist_2d(l_wrist, r_wrist)
            shoulder_dist = dist_2d(l_sh, r_sh)
            if shoulder_dist > 5.0:
                arm_spans.append(wrist_dist / shoulder_dist)
            
            # 4. 后坐/前顶（正脸同轴视角下测量臀部到脚踝在画面 Y 轴的位缩距，或测量上半身体长与下半身表态比例）
            # 因为垂直降落，深蹲会使得 髋-踝 的 Y轴距离缩短。
            pelvis_y = (l_hip['y'] + r_hip['y']) / 2.0
            shoulder_y = (l_sh['y'] + r_sh['y']) / 2.0
            ankle_mid_y = (l_ankle['y'] + r_ankle['y']) / 2.0
            trunk_length = max(1.0, abs(pelvis_y - shoulder_y))
            leg_y_extension = abs(ankle_mid_y - pelvis_y)
            # 蹲得多（膝盖弯曲） -> leg_y_extension / trunk_length 会变小
            knee_bend_ratios.append(leg_y_extension / trunk_length)

        if valid_frames == 0:
            return {"status": "error", "message": "No valid frames with confident keypoints found"}

        # 聚合评价统计
        mean_offset = statistics.mean(offsets)
        mean_arm_span = statistics.mean(arm_spans) if arm_spans else 1.0
        mean_bend_ratio = statistics.mean(knee_bend_ratios) if knee_bend_ratios else 2.0
        
        # 评分基础分 100
        score = 100.0
        
        # 指标评价
        notes = []
        # 重心打分：偏移超出两脚间距的20%开始扣分
        if mean_offset > 0.20:
            score -= (mean_offset - 0.20) * 100
            notes.append("【重心】监测到重心偏向一侧，推坡时请尽量保证重量均匀分布在双脚，避免斜滑卡刃。")
        else:
            notes.append("【重心】双脚均匀受力，控制得很棒。")
            
        # 双臂舒展打分
        if mean_arm_span < 1.3:
            score -= 10
            notes.append("【身姿】手臂过于靠近身体。保持自然站姿，将双臂伸展开以维持滚落线平衡。")

        # 前/后刃定制判定点
        if self.action == 'heel_slip':
            if mean_bend_ratio > 1.8: # 脚伸得很直
                score -= 15
                notes.append("【后刃发力】膝盖显得过于直立或死锁。试试“像坐在高脚凳上一样”微微弯曲臀部和膝盖。")
        elif self.action == 'toe_slip':
            if mean_bend_ratio > 1.6: 
                score -= 15
                notes.append("【前刃发力】腿部过于僵硬。请想象自己像短跑运动员起跑，将膝盖稍微向前脚尖推。")

        score = max(0.0, min(100.0, score))

        return {
            "status": "success",
            "evaluator": "SlipEvaluator (Sidecar Post-Process)",
            "mode": self.mode,
            "action": self.action,
            "metrics": {
                "valid_frames_analyzed": valid_frames,
                "overall_score": round(score, 1),
                "avg_center_offset_ratio": round(mean_offset, 3),
                "avg_knee_extension_ratio": round(mean_bend_ratio, 3),
                "avg_arm_span_ratio": round(mean_arm_span, 3)
            },
            "coaching_notes": notes
        }
