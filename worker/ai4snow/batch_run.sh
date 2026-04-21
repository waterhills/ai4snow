#!/bin/bash
conda_python="/Users/bill_chlt/miniconda3/envs/snowboard/bin/python"

# 查找 input 目录下所有的 mp4 文件
find input -type f -iname "*.mp4" | while read -r video; do
    echo "========================================"
    echo "开始处理视频: $video"
    echo "========================================"
    
    # 提取 action 类型 (例如 slip, falling_leaf 等)
    # 假设路径是 input/beginner/slip/xxx.MP4
    action=$(basename $(dirname "$video"))
    mode=$(basename $(dirname $(dirname "$video")))

    # 运行原本的流水线 (生成 tracker 和 keypoints)
    $conda_python run_ski_pipeline.py "$video" --pipeline-id jsba
    
    echo "处理完成: $video"
done
