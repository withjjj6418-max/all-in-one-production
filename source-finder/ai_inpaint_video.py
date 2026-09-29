"""Fixed-region video inpainting with the Apache-2.0 OpenCV LaMa ONNX model."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Callable

import cv2
import numpy as np
import onnxruntime as ort


MODEL_SIZE = 512


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--regions", required=True, help="JSON array of normalized rectangles")
    parser.add_argument("--model", required=True)
    parser.add_argument("--ffmpeg", required=True)
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--end", type=float, default=0.0)
    parser.add_argument("--cpu", action="store_true")
    return parser.parse_args()


def normalized_regions(value: str) -> list[dict[str, float]]:
    raw = json.loads(value)
    regions: list[dict[str, float]] = []
    for item in raw[:8] if isinstance(raw, list) else []:
        region = {
            "x": max(0.0, min(1.0, float(item.get("x", 0)))),
            "y": max(0.0, min(1.0, float(item.get("y", 0)))),
            "width": max(0.0, min(1.0, float(item.get("width", 0)))),
            "height": max(0.0, min(1.0, float(item.get("height", 0)))),
        }
        if region["width"] >= 0.01 and region["height"] >= 0.01:
            regions.append(region)
    if not regions:
        raise ValueError("제거할 영역이 없습니다.")
    return regions


def build_mask(width: int, height: int, regions: list[dict[str, float]]) -> np.ndarray:
    mask = np.zeros((height, width), dtype=np.uint8)
    padding = max(3, round(min(width, height) * 0.004))
    for region in regions:
        x1 = max(0, round(region["x"] * width) - padding)
        y1 = max(0, round(region["y"] * height) - padding)
        x2 = min(width, round((region["x"] + region["width"]) * width) + padding)
        y2 = min(height, round((region["y"] + region["height"]) * height) + padding)
        cv2.rectangle(mask, (x1, y1), (max(x1, x2 - 1), max(y1, y2 - 1)), 255, -1)
    return mask


def refine_overlay_mask(
    capture: cv2.VideoCapture,
    selection_mask: np.ndarray,
    fps: float,
    total_frames: int,
    start_seconds: float,
    end_seconds: float,
) -> tuple[np.ndarray, float]:
    """Keep fixed overlay pixels inside the user's rectangles instead of erasing the whole person underneath."""
    first = max(0, min(total_frames - 1, round(max(0.0, start_seconds) * fps)))
    last_seconds = end_seconds if end_seconds > start_seconds else total_frames / max(fps, 1.0)
    last = max(first, min(total_frames - 1, round(last_seconds * fps)))
    sample_indexes = np.linspace(first, last, num=min(12, max(3, last - first + 1)), dtype=np.int32)
    samples: list[np.ndarray] = []
    for frame_index in np.unique(sample_indexes):
        capture.set(cv2.CAP_PROP_POS_FRAMES, int(frame_index))
        ok, frame = capture.read()
        if ok:
            samples.append(frame)
    capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
    if len(samples) < 2:
        raise RuntimeError("고정 자막을 판별할 프레임이 부족합니다. 제거 구간을 조금 더 길게 지정해주세요.")

    stack = np.stack(samples).astype(np.float32)
    median = np.median(stack, axis=0).astype(np.uint8)
    temporal_std = np.mean(np.std(stack, axis=0), axis=2)
    gray = cv2.cvtColor(median, cv2.COLOR_BGR2GRAY)
    saturation = cv2.cvtColor(median, cv2.COLOR_BGR2HSV)[:, :, 1]
    gradient = cv2.magnitude(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1))

    # Captions and logos stay fixed while the underlying person/background moves. Keep only
    # stable bright/dark/colourful/edge pixels, then include their compressed outlines.
    stable = temporal_std < 13.0
    overlay_like = (gray > 200) | (gray < 55) | (saturation > 85) | (gradient > 42)
    refined = ((selection_mask > 0) & stable & overlay_like).astype(np.uint8) * 255
    kernel_size = max(5, round(min(gray.shape) * 0.008))
    if kernel_size % 2 == 0:
        kernel_size += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    refined = cv2.morphologyEx(refined, cv2.MORPH_CLOSE, kernel, iterations=1)
    refined = cv2.dilate(refined, kernel, iterations=2)

    component_count, labels, stats, _ = cv2.connectedComponentsWithStats(refined, 8)
    cleaned = np.zeros_like(refined)
    minimum_area = max(8, round(gray.shape[0] * gray.shape[1] * 0.00001))
    for label in range(1, component_count):
        if stats[label, cv2.CC_STAT_AREA] >= minimum_area:
            cleaned[labels == label] = 255
    selected_area = max(1, int(np.count_nonzero(selection_mask)))
    coverage = float(np.count_nonzero(cleaned)) / selected_area
    # Never send the whole user rectangle to the image model. A rectangle can contain a
    # face, arm, or body, and asking a single-frame model to recreate all of it can produce
    # anatomically implausible results. It is safer to stop without replacing the source.
    if coverage < 0.01:
        raise RuntimeError(
            "선택 영역에서 고정된 로고·자막 픽셀을 찾지 못했습니다. "
            "글자보다 약간 넓게 다시 선택하거나 빠른 제거를 사용해주세요. 원본은 변경되지 않았습니다."
        )
    if coverage > 0.92:
        raise RuntimeError(
            "선택 영역 대부분이 제거 대상으로 감지되어 인물까지 변형될 위험이 있습니다. "
            "글자·로고에 더 가깝게 영역을 줄여주세요. 원본은 변경되지 않았습니다."
        )
    return cleaned, coverage


def letterbox(image: np.ndarray, interpolation: int) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    height, width = image.shape[:2]
    scale = min(MODEL_SIZE / width, MODEL_SIZE / height)
    resized_width = max(1, round(width * scale))
    resized_height = max(1, round(height * scale))
    resized = cv2.resize(image, (resized_width, resized_height), interpolation=interpolation)
    left = (MODEL_SIZE - resized_width) // 2
    right = MODEL_SIZE - resized_width - left
    top = (MODEL_SIZE - resized_height) // 2
    bottom = MODEL_SIZE - resized_height - top
    border = cv2.BORDER_REFLECT_101 if min(resized.shape[:2]) > 1 else cv2.BORDER_REPLICATE
    boxed = cv2.copyMakeBorder(resized, top, bottom, left, right, border)
    return boxed, (left, top, resized_width, resized_height)


def unletterbox(image: np.ndarray, placement: tuple[int, int, int, int], width: int, height: int) -> np.ndarray:
    left, top, resized_width, resized_height = placement
    cropped = image[top : top + resized_height, left : left + resized_width]
    return cv2.resize(cropped, (width, height), interpolation=cv2.INTER_CUBIC)


def create_session(model_path: str, force_cpu: bool) -> tuple[Callable[[dict[str, np.ndarray]], np.ndarray], str]:
    del force_cpu
    options = ort.SessionOptions()
    options.log_severity_level = 3
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(model_path, sess_options=options, providers=["CPUExecutionProvider"])

    def onnx_run(inputs: dict[str, np.ndarray]) -> np.ndarray:
        return session.run(None, inputs)[0]

    return onnx_run, "ONNX Runtime CPU"


def inpaint_frames(
    frames: list[np.ndarray],
    mask: np.ndarray,
    soft_mask: np.ndarray,
    session: Callable[[dict[str, np.ndarray]], np.ndarray],
) -> list[np.ndarray]:
    height, width = frames[0].shape[:2]
    boxed_frames: list[np.ndarray] = []
    placement = (0, 0, 0, 0)
    for frame in frames:
        boxed_frame, placement = letterbox(frame, cv2.INTER_AREA)
        boxed_frames.append(boxed_frame)
    boxed_mask, _ = letterbox(mask, cv2.INTER_NEAREST)
    image_tensor = np.stack([
        np.transpose(frame.astype(np.float32) * 0.00392, (2, 0, 1))
        for frame in boxed_frames
    ])
    mask_tensor = np.repeat((boxed_mask.astype(np.float32) / 255.0)[None, None, ...], len(frames), axis=0)
    outputs = session({"image": image_tensor, "mask": mask_tensor})
    rendered_frames: list[np.ndarray] = []
    alpha = soft_mask[..., None]
    for frame, output in zip(frames, outputs, strict=True):
        output = np.transpose(output, (1, 2, 0))
        # This OpenCV model may return either normalized RGB or RGB in 0..255.
        if float(np.nanmax(output)) <= 2.0:
            output *= 255.0
        output = np.nan_to_num(output, nan=0.0, posinf=255.0, neginf=0.0)
        output_bgr = np.clip(output, 0, 255).astype(np.uint8)
        restored = unletterbox(output_bgr, placement, width, height)
        rendered_frames.append(np.clip(frame.astype(np.float32) * (1.0 - alpha) + restored.astype(np.float32) * alpha, 0, 255).astype(np.uint8))
    return rendered_frames


def main() -> int:
    args = parse_args()
    input_path = str(Path(args.input).resolve())
    output_path = str(Path(args.output).resolve())
    model_path = str(Path(args.model).resolve())
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"입력 영상을 찾을 수 없습니다: {input_path}")
    if not os.path.isfile(model_path):
        raise FileNotFoundError("AI 모델이 없습니다. npm run shorts-family:setup-inpainting을 먼저 실행해주세요.")

    regions = normalized_regions(args.regions)
    capture = cv2.VideoCapture(input_path)
    if not capture.isOpened():
        raise RuntimeError("입력 영상을 열지 못했습니다.")
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(capture.get(cv2.CAP_PROP_FPS)) or 30.0
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if width < 2 or height < 2:
        raise RuntimeError("영상 크기를 확인하지 못했습니다.")

    selection_mask = build_mask(width, height, regions)
    mask, mask_coverage = refine_overlay_mask(capture, selection_mask, fps, total, args.start, args.end)
    feather = max(3, round(min(width, height) * 0.006))
    if feather % 2 == 0:
        feather += 1
    soft_mask = cv2.GaussianBlur(mask, (feather, feather), 0).astype(np.float32) / 255.0
    session, provider = create_session(model_path, args.cpu)
    print(json.dumps({"event": "started", "provider": provider, "frames": total, "maskCoverage": round(mask_coverage, 4)}, ensure_ascii=False), flush=True)

    ffmpeg_command = [
        args.ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24",
        "-s", f"{width}x{height}", "-r", f"{fps:.8f}", "-i", "pipe:0", "-i", input_path,
        "-map", "0:v:0", "-map", "1:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart",
        "-y", output_path,
    ]
    process = subprocess.Popen(ffmpeg_command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    processed = 0
    try:
        batch_size = 1
        while True:
            frames: list[np.ndarray] = []
            for _ in range(batch_size):
                ok, frame = capture.read()
                if not ok:
                    break
                frames.append(frame)
            if not frames:
                break
            batch_start_seconds = processed / fps
            should_inpaint = batch_start_seconds >= max(0.0, args.start) and (args.end <= args.start or batch_start_seconds <= args.end)
            rendered_batch = inpaint_frames(frames, mask, soft_mask, session) if should_inpaint else frames
            for rendered in rendered_batch:
                assert process.stdin is not None
                process.stdin.write(rendered.tobytes())
                processed += 1
            if processed <= batch_size or processed % 30 < batch_size or processed == total:
                print(json.dumps({"event": "progress", "current": processed, "total": total}, ensure_ascii=False), flush=True)
        assert process.stdin is not None
        process.stdin.close()
        stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
        return_code = process.wait()
        if return_code != 0:
            raise RuntimeError(stderr.strip() or "FFmpeg 영상 저장에 실패했습니다.")
    except Exception:
        process.kill()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
        raise
    finally:
        capture.release()

    if processed == 0 or not os.path.isfile(output_path) or os.path.getsize(output_path) == 0:
        raise RuntimeError("AI 편집본이 생성되지 않았습니다.")
    print(json.dumps({"event": "complete", "provider": provider, "frames": processed}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
