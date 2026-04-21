from abc import ABC, abstractmethod

class BaseExternalEvaluator(ABC):
    """
    基类：外部级打分评价器
    采用后处理模式，不涉及底层视觉代码修改。
    子类需实现具体的动作打分逻辑。
    """
    
    def __init__(self, mode: str, action: str):
        self.mode = mode
        self.action = action

    @abstractmethod
    def evaluate(self, keypoints_data):
        """
        核心打分函数。
        :param keypoints_data: 包含序列化骨骼关键点时间序列的数据（如 dict 或 list）。
        :return: 打分结果与分析数据字典
        """
        pass
