# 外部评价系统 (Sidecar Evaluator)

本目录下的所有评价器均采用后处理模式工作。我们不修改原有的视觉识别底层代码。所有的评价器（如初学者推坡）只需假定已经拿到了标准化的 17 关键点时间序列数据（Dict 或 DataFrame 格式），进行纯数学计算并输出打分结果即可。

## 工作流说明

1. 原系统的追踪推理流程保持 100% 独立，跑完会自动把带有 17 关键点信息的骨骼文件落在 `output/` 缓存下（例如 `.json` 格式，或 `.pt` 格式）。
2. 在新功能中，触发并调用根目录的新调度器：
   ```bash
   python run_enhanced_evaluator.py --data_path ./output/your_data.json --mode beginner --action heel_slip
   ```
3. 这个 `run_enhanced_evaluator.py` 在外部读取骨骼数据，转交给 `external_evaluators/` 内的各个 `xxx_evaluator.py` 算子。
4. 算子内部纯负责几何数学计算（算角度、算距离、判断重心等），并直接反馈得分体系，没有任何视觉处理干扰。这实现了**与重构底座完全解耦的零风险二次开发**。
