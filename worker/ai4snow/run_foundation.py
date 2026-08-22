#!/usr/bin/env python3
"""Command-line scheduler for the Sparse Foundation v1 public API."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from foundation import FoundationResult, analyze_video


PROJECT_ROOT = Path(__file__).resolve().parent
SUPPORTED_EXTENSIONS = {'.mp4', '.mov', '.m4v'}


def nonnegative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError('must be zero or greater')
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Run AI4Snow Sparse Foundation v1.')
    parser.add_argument(
        '--video',
        action='append',
        default=[],
        help='Input video; repeat this option for multiple videos.',
    )
    parser.add_argument('--input-dir', help='Add every supported video in this directory.')
    parser.add_argument(
        '--output-dir',
        help='Batch output root. Defaults to the next output/roundN (new).',
    )
    parser.add_argument(
        '--max-analysis-frames',
        type=nonnegative_int,
        default=0,
        help='Optional smoke-test cap; zero processes each full video.',
    )
    parser.add_argument('--force', action='store_true', help='Overwrite non-empty per-video outputs.')
    return parser


def resolve_project_path(value: str | Path) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path.resolve()


def next_foundation_round() -> Path:
    output_root = PROJECT_ROOT / 'output'
    round_number = 1
    while (output_root / f'round{round_number} (new)').exists():
        round_number += 1
    return output_root / f'round{round_number} (new)'


def collect_videos(video_values: list[str], input_dir_value: str | None) -> list[Path]:
    candidates = [resolve_project_path(value) for value in video_values]
    if input_dir_value:
        input_dir = resolve_project_path(input_dir_value)
        if not input_dir.is_dir():
            raise NotADirectoryError(f'输入目录不存在: {input_dir}')
        candidates.extend(
            sorted(
                (
                    path.resolve()
                    for path in input_dir.iterdir()
                    if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
                ),
                key=lambda path: path.name.lower(),
            )
        )
    if not candidates:
        raise ValueError('请至少指定一个 --video 或 --input-dir')

    videos: list[Path] = []
    seen: set[Path] = set()
    for video in candidates:
        if video.suffix.lower() not in SUPPORTED_EXTENSIONS:
            raise ValueError(f'不支持的视频扩展名: {video}')
        if not video.is_file():
            raise FileNotFoundError(f'输入视频不存在: {video}')
        if video not in seen:
            seen.add(video)
            videos.append(video)
    return videos


def sanitize_name(value: str) -> str:
    name = re.sub(r'[^0-9A-Za-z._-]+', '_', value).strip('._-')
    return name or 'video'


def allocate_names(videos: list[Path]) -> list[str]:
    counts: dict[str, int] = {}
    names: list[str] = []
    for video in videos:
        base = sanitize_name(video.stem)
        counts[base] = counts.get(base, 0) + 1
        names.append(base if counts[base] == 1 else f'{base}_{counts[base]}')
    return names


def print_result(result: FoundationResult, output_dir: Path) -> None:
    print('\n===== AI4Snow Foundation =====\n')
    print(f'Video: {result.video_path}')
    print(f'Duration: {result.video_duration:.3f} s')
    print(f'Source FPS: {result.source_fps:.3f}')
    print(f'Analysis FPS: {result.analysis_fps:.3f}')
    print(f'\nRuntime: {result.runtime:.3f} s')
    print(f'RTF: {result.rtf:.3f}')
    print(f'\nTracked: {result.tracked_frames}/{result.pose_frames}')
    print(f'Pose frames: {result.pose_frames}')
    print(f'\nOutput: {output_dir}')
    print(f'Overlay: {result.overlay_path}')
    print(f'PoseSequence: {result.pose_sequence_path}')
    print(f'\nSTATUS: {result.status}')


def write_round_summary(output_root: Path, results: list[FoundationResult]) -> Path:
    lines = [
        '# AI4Snow Foundation',
        '',
        'Current Foundation: Sparse Foundation v1',
        '',
        '| Video | Duration | Source FPS | Analysis FPS | Runtime | RTF | Tracked | Pose Frames | Status | Output |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ]
    for result in results:
        lines.append(
            f'| {result.video_path.name} | {result.video_duration:.3f} s | '
            f'{result.source_fps:.3f} | {result.analysis_fps:.3f} | '
            f'{result.runtime:.3f} s | {result.rtf:.3f} | '
            f'{result.tracked_frames}/{result.pose_frames} | {result.pose_frames} | '
            f'{result.status} | `{result.pose_sequence_path.parent}` |'
        )
    summary_path = output_root / 'round_summary.md'
    summary_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return summary_path


def print_batch_summary(results: list[FoundationResult], summary_path: Path) -> None:
    if len(results) <= 1:
        return
    print('\n===== Batch Summary =====\n')
    print(f"{'Video':24} {'Runtime':>10} {'RTF':>8} {'Tracked':>14} {'Status':>8}")
    for result in results:
        tracked = f'{result.tracked_frames}/{result.pose_frames}'
        print(
            f'{result.video_path.name[:24]:24} '
            f'{result.runtime:9.3f}s {result.rtf:8.3f} {tracked:>14} {result.status:>8}'
        )
    print(f'\nSummary: {summary_path}')


def main() -> int:
    args = build_parser().parse_args()
    try:
        videos = collect_videos(args.video, args.input_dir)
        output_root = resolve_project_path(args.output_dir) if args.output_dir else next_foundation_round()
        output_root.mkdir(parents=True, exist_ok=True)
        names = allocate_names(videos)
        results: list[FoundationResult] = []
        for video, name in zip(videos, names):
            video_output = output_root / name
            result = analyze_video(
                video_path=video,
                output_dir=video_output,
                max_analysis_frames=args.max_analysis_frames,
                force=args.force,
            )
            results.append(result)
            print_result(result, video_output)
        summary_path = write_round_summary(output_root, results)
        print_batch_summary(results, summary_path)
        return 0
    except Exception as exc:
        print(f'\n[Foundation Error] {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
