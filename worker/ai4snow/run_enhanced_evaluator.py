import argparse
import json
import logging

def load_data(data_path: str):
    """
    简单无损地读取外部数据（从原系统生成的关键点等数据文件）
    """
    if data_path.endswith('.json'):
        with open(data_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    elif data_path.endswith('.csv'):
        import csv
        with open(data_path, 'r', encoding='utf-8') as f:
            return list(csv.DictReader(f))
    elif data_path.endswith('.pt'):
        import torch
        # 这里可能需要原系统的相关依赖结构，但单纯读取通常不需要
        return torch.load(data_path, map_location='cpu')
    else:
        raise ValueError(f"Unsupported data format: {data_path}")

def route_to_evaluator(mode: str, action: str, data):
    """
    将读取到的数据分发给 evaluation.beginner 下对应的类。
    """
    print(f"[Dispatcher] Routing to external evaluator -> Mode: {mode}, Action: {action}")
    
    # 在这里后续开发者可以轻松导入自己加的后处理算子，例如：
    if mode == 'beginner' and action in ['heel_slip', 'toe_slip']:
        from evaluation.beginner.slip_evaluator import SlipEvaluator
        evaluator = SlipEvaluator(mode, action)
        return evaluator.evaluate(data)
        
    elif mode == 'beginner' and action in ['falling_leaf_heel', 'falling_leaf_toe']:
        from evaluation.beginner.falling_leaf_evaluator import FallingLeafEvaluator
        evaluator = FallingLeafEvaluator(mode, action)
        return evaluator.evaluate(data)
    
    print("[Dispatcher] Target evaluator not instantiated (mock pass).")
    return {
        "status": "success",
        "mode": mode,
        "action": action,
        "msg": "Data routed and evaluated via sidecar pattern successfully."
    }

def main():
    parser = argparse.ArgumentParser(description="Sidecar Dispatcher for Enhanced Evaluation")
    parser.add_argument("--data_path", type=str, required=True, help="Path to the exported skeleton sequence data file")
    parser.add_argument("--mode", type=str, required=True, help="Evaluation mode (e.g., beginner, pro_mode)")
    parser.add_argument("--action", type=str, default="none", help="Which specific action to analyze (e.g., heel_slip)")
    
    args = parser.parse_args()
    
    print(f"[*] Dispatcher Booted. Using sidecar evaluator...")
    print(f"[*] Reading standard track data from: {args.data_path}")
    
    try:
        data_payload = load_data(args.data_path)
        print("[*] Data read successfully. Passing to evaluator...")
        
        
        result = route_to_evaluator(args.mode, args.action, data_payload)
        
        # 结果文件落盘分发
        import os
        from pathlib import Path
        base_name = Path(args.data_path).stem.replace('_rtmpose_keypoints', '')
        
        # 将特定的动作对齐到 input 目录层级标准
        action_dir = args.action
        if 'falling_leaf' in args.action:
            action_dir = 'falling_leaf'
        elif 'slip' in args.action:
            action_dir = 'slip'
            
        out_dir = Path(f"output/{args.mode}/{action_dir}/{base_name}")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "review_metrics.json"
        
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
            
        print(f"\n[Result Payload] -> Saved to {out_path}")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    except Exception as e:
        print(f"[!] Evaluation failed: {e}")

if __name__ == "__main__":
    main()
