"""Public API for the current AI4Snow visual foundation."""

from .api import FoundationResult, PoseSequence, analyze_video

__all__ = ['analyze_video', 'FoundationResult', 'PoseSequence']
