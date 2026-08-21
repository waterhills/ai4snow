import math
import statistics
from typing import Dict, List, Any
from .base_evaluator import BaseExternalEvaluator

COCO_MAPPING = {
    0: 'nose',
    5: 'left_shoulder', 6: 'right_shoulder',
    9: 'left_wrist', 10: 'right_wrist',
    11: 'left_hip', 12: 'right_hip',
    13: 'left_knee', 14: 'right_knee',
    15: 'left_ankle', 16: 'right_ankle'
}

def extract_keypoint(frame_kps, kp_name: str) -> Dict[str, float]:
    if isinstance(frame_kps, dict) and kp_name in frame_kps:
        val = frame_kps[kp_name]
        return {'x': float(val.get('x', 0)), 'y': float(val.get('y', 0)), 'conf': float(val.get('conf', 0))}
    
    if isinstance(frame_kps, (list, tuple)):
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

class FallingLeafEvaluator(BaseExternalEvaluator):
    """
    落叶飘 (Falling Leaf / Pendulum Slip) 评价器
    重点检测：动态的重心游走，面部位移指向，以及宏观Z字形移动轨迹
    """
    def __init__(self, mode: str, action: str):
        super().__init__(mode, action)
        self.min_conf = 0.25

    def evaluate(self, keypoints_data: Any) -> Dict[str, Any]:
        frames = keypoints_data
        if isinstance(keypoints_data, dict) and 'keypoints' in keypoints_data:
            frames = keypoints_data['keypoints']
            
        if hasattr(frames, 'tolist'):
            frames = frames.tolist()

        if not isinstance(frames, (list, tuple)) or len(frames) == 0:
            return {"status": "error", "message": "Invalid or empty keypoint data"}

        frame_metrics = []
        
        for frame in frames:
            l_hip = extract_keypoint(frame, 'left_hip')
            r_hip = extract_keypoint(frame, 'right_hip')
            l_ankle = extract_keypoint(frame, 'left_ankle')
            r_ankle = extract_keypoint(frame, 'right_ankle')
            nose = extract_keypoint(frame, 'nose')
            l_sh = extract_keypoint(frame, 'left_shoulder')
            r_sh = extract_keypoint(frame, 'right_shoulder')
            
            # 要求核心点位可见
            if min([l_hip['conf'], r_hip['conf'], l_ankle['conf'], r_ankle['conf'], nose['conf']]) < self.min_conf:
                continue
                
            pelvis_x = (l_hip['x'] + r_hip['x']) / 2.0
            pelvis_y = (l_hip['y'] + r_hip['y']) / 2.0
            ankle_mid_x = (l_ankle['x'] + r_ankle['x']) / 2.0
            shoulder_mid_x = (l_sh['x'] + r_sh['x']) / 2.0
            shoulder_y = (l_sh['y'] + r_sh['y']) / 2.0
            ankle_mid_y = (l_ankle['y'] + r_ankle['y']) / 2.0
            
            stance_width = max(10.0, abs(l_ankle['x'] - r_ankle['x']))
            offset_ratio = (pelvis_x - ankle_mid_x) / stance_width  # 有方向
            
            nose_offset = nose['x'] - shoulder_mid_x 

            trunk_length = max(1.0, abs(pelvis_y - shoulder_y))
            leg_y_extension = abs(ankle_mid_y - pelvis_y)
            knee_bend_ratio = leg_y_extension / trunk_length

            shoulder_tilt = math.atan2(r_sh['y'] - l_sh['y'], r_sh['x'] - l_sh['x'])

            frame_metrics.append({
                'pelvis_x': pelvis_x,
                'offset_ratio': offset_ratio,
                'nose_offset': nose_offset,
                'knee_bend_ratio': knee_bend_ratio,
                'shoulder_tilt': shoulder_tilt
            })

        if len(frame_metrics) < 5:
            return {"status": "error", "message": "Not enough confident frames for Falling Leaf analysis"}

        # 分析时序
        total_dx = 0
        oscillation_count = 0
        look_align_count = 0
        mislook_count = 0
        bend_ratios = []
        flail_count = 0

        window = 3 
        for i in range(window, len(frame_metrics)):
            dx = frame_metrics[i]['pelvis_x'] - frame_metrics[i-window]['pelvis_x']
            total_dx += abs(dx)
            
            # 检测视线引导(移动方向与鼻子的相对方向是否一致)
            # 因为 2D 人体，向左飘 dx < 0，鼻子应该在肩膀的左侧 nose_offset < 0
            if abs(dx) > 2.0:  # 只有在发生明显横移时检测
                if (dx < 0 and frame_metrics[i]['nose_offset'] < 0) or (dx > 0 and frame_metrics[i]['nose_offset'] > 0):
                    look_align_count += 1
                else:
                    mislook_count += 1

            bend_ratios.append(frame_metrics[i]['knee_bend_ratio'])

            # 动态重心转移（考察是否有极值震荡）
            offset = frame_metrics[i]['offset_ratio']
            if abs(offset) > 0.08:  # 偏移超 8% 即认为尝试了重心引导
                oscillation_count += 1
                
            # 框架间距评估 (帧防乱甩)
            tilt_diff = abs(frame_metrics[i]['shoulder_tilt'] - frame_metrics[i-1]['shoulder_tilt'])
            if tilt_diff > 0.15: # 约 8.5 度的剧烈倾覆
                flail_count += 1

        score = 100.0
        notes = []

        # 1. 轨迹判断
        avg_dx_per_frame = total_dx / len(frame_metrics)
        if avg_dx_per_frame < 0.5:
            score -= 30
            notes.append("【轨迹】检测到横向轨迹拉动不明显，动作酷似直接下落的推坡。落叶飘需要你横向划过整个雪道。")
        else:
            notes.append("【轨迹】良好的横移轨迹。")

        # 2. 60/40 重心转移判断
        dynamic_weight_pct = oscillation_count / len(frame_metrics)
        if dynamic_weight_pct < 0.2:
            score -= 20
            notes.append("【重心】钟摆式启动需要刻意的偏向施压。系统未监测到足够的单侧重心引导，尝试让前置脚压上60%的体重。")
            
        # 3. 视线控制
        if look_align_count + mislook_count > 0:
            look_accuracy = look_align_count / (look_align_count + mislook_count)
            if look_accuracy < 0.5:
                score -= 15
                notes.append("【身姿】“盲滑”预警。当向一侧飘去时，务必将头和视线明确地转向前进方向的山坡。")

        # 4. 基础姿态与稳定性
        mean_bend = statistics.mean(bend_ratios) if bend_ratios else 2.0
        if self.action == 'falling_leaf_heel' and mean_bend > 1.8:
            score -= 10
            notes.append("【基础】后刃发力有些僵硬，勿忘微弯膝盖。")
        elif self.action == 'falling_leaf_toe' and mean_bend > 1.6:
            score -= 10
            notes.append("【基础】前刃需要像短跑起跑般让膝盖向前探寻。")
            
        flailing_ratio = flail_count / len(frame_metrics)
        if flailing_ratio > 0.1:
            score -= 20
            notes.append("【稳定性预警】检测到上半身/肩膀存在剧烈的无序晃动（乱甩）。请保持核心稳定，依靠下肢重心刻意偏压去移动，摒弃用手乱甩借力的坏习惯。")

        score = max(0.0, min(100.0, score))

        return {
            "status": "success",
            "evaluator": "FallingLeafEvaluator (Sidecar Post-Process)",
            "mode": self.mode,
            "action": self.action,
            "metrics": {
                "valid_frames": len(frame_metrics),
                "overall_score": round(score, 1),
                "avg_abs_dx_per_frame": round(avg_dx_per_frame, 3),
                "dynamic_weight_pct": round(dynamic_weight_pct, 3),
                "look_align_ratio": round(look_align_count / max(1, look_align_count + mislook_count), 3),
                "flailing_frame_ratio": round(flailing_ratio, 3)
            },
            "coaching_notes": notes
        }
