#!/usr/bin/env python3
import base64
import json
import os
import sys
import tempfile
from typing import Any, Dict, List, Optional, Tuple

try:
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps  # type: ignore
except Exception:  # pragma: no cover - optional runtime dependency
    Image = None
    ImageEnhance = None
    ImageFilter = None
    ImageOps = None


OCR_INSTANCE = None
EXERCISE_KEYWORDS = (
    "press",
    "row",
    "curl",
    "pulldown",
    "pushdown",
    "fly",
    "raise",
    "squat",
    "deadlift",
    "lunge",
    "extension",
    "crunch",
)


def emit(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def fail(message: str, code: int = 1) -> int:
    sys.stderr.write(str(message).strip() + "\n")
    sys.stderr.flush()
    return code


def decode_payload(raw: str) -> Tuple[bytes, str]:
    data = json.loads(raw or "{}")
    b64 = str(data.get("imageBase64") or "").strip()
    if not b64:
        raise ValueError("Missing imageBase64")
    filename = str(data.get("filename") or "import.jpg").strip() or "import.jpg"
    blob = base64.b64decode(b64, validate=True)
    if not blob:
        raise ValueError("Decoded image is empty")
    return blob, filename


def get_ocr():
    try:
        from paddleocr import PaddleOCR  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"paddleocr import failed: {exc}") from exc

    global OCR_INSTANCE
    if OCR_INSTANCE is None:
        OCR_INSTANCE = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return OCR_INSTANCE


def normalize_text_token(raw: str) -> str:
    return " ".join(str(raw or "").strip().lower().split())


def group_result_lines(result: Any) -> Tuple[List[str], List[float]]:
    items: List[Tuple[float, float, str, float]] = []
    for block in result or []:
        for row in block or []:
            if not row or len(row) < 2:
                continue
            pts = row[0] if isinstance(row[0], (list, tuple)) else []
            text_part = row[1][0] if isinstance(row[1], (list, tuple)) and len(row[1]) > 0 else ""
            conf_part = row[1][1] if isinstance(row[1], (list, tuple)) and len(row[1]) > 1 else 0
            text = str(text_part or "").strip()
            if not text:
                continue
            try:
                conf = float(conf_part or 0)
            except Exception:
                conf = 0.0
            xs: List[float] = []
            ys: List[float] = []
            for pt in pts or []:
                if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                    try:
                        xs.append(float(pt[0]))
                        ys.append(float(pt[1]))
                    except Exception:
                        pass
            x = min(xs) if xs else 0.0
            y = sum(ys) / len(ys) if ys else 0.0
            items.append((y, x, text, max(0.0, min(1.0, conf))))

    items.sort(key=lambda item: (round(item[0] / 18.0), item[1]))
    lines: List[str] = []
    confs: List[float] = []
    current_parts: List[str] = []
    current_confs: List[float] = []
    current_y: Optional[float] = None

    def flush() -> None:
        if not current_parts:
            return
        joined = " ".join(part for part in current_parts if part).strip()
        if joined:
            lines.append(joined)
            confs.append(sum(current_confs) / len(current_confs) if current_confs else 0.0)

    for y, _x, text, conf in items:
        if current_y is None:
            current_y = y
        if current_y is not None and abs(y - current_y) > 16:
            flush()
            current_parts = []
            current_confs = []
            current_y = y
        current_parts.append(text)
        current_confs.append(conf)

    flush()
    return lines, confs


def score_ocr_text(lines: List[str], confs: List[float]) -> float:
    if not lines:
        return 0.0
    score = 0.0
    lower_lines = [normalize_text_token(line) for line in lines if str(line or "").strip()]
    score += len(lower_lines) * 4.0
    if confs:
        score += (sum(confs) / len(confs)) * 40.0

    for line in lower_lines:
        if any(keyword in line for keyword in EXERCISE_KEYWORDS):
            score += 6.0
        if "last week" in line:
            score += 5.0
        if " x " in f" {line} " or "4x10" in line or "3x10" in line or "2x12" in line:
            score += 4.0
        if line in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"):
            score += 5.0
        if "workout log" in line:
            score += 3.0
        if len(line) <= 2:
            score -= 2.5
        if line.isdigit():
            score -= 3.0
    return score


def run_ocr_on_path(image_path: str) -> Dict[str, Any]:
    ocr = get_ocr()
    result = ocr.ocr(image_path, cls=True)
    lines, confs = group_result_lines(result)
    joined = "\n".join(lines).strip()
    avg_conf = sum(confs) / len(confs) if confs else 0.0
    return {
        "ok": True,
        "engine": "paddleocr",
        "text": joined,
        "lineCount": len(lines),
        "avgConfidence": round(avg_conf, 6),
        "score": round(score_ocr_text(lines, confs), 6),
    }


def build_variant_paths(image_path: str) -> List[str]:
    if Image is None:
        return [image_path]

    temp_paths: List[str] = [image_path]
    img = Image.open(image_path).convert("RGB")
    width, height = img.size
    upscale_size = (max(width * 2, 1200), max(height * 2, 1200))

    variants: List[Image.Image] = []

    # High-contrast grayscale upscale for text-heavy screenshots.
    gray = ImageOps.grayscale(img)
    gray = ImageOps.autocontrast(gray)
    gray = gray.resize(upscale_size)
    variants.append(gray)

    # Sharpened contrast pass.
    sharp = ImageOps.grayscale(img)
    sharp = ImageEnhance.Contrast(sharp).enhance(1.8) if ImageEnhance else sharp
    sharp = sharp.resize(upscale_size)
    sharp = sharp.filter(ImageFilter.SHARPEN) if ImageFilter else sharp
    variants.append(sharp)

    # Threshold-ish black/white pass.
    bw = ImageOps.grayscale(img)
    bw = ImageOps.autocontrast(bw)
    bw = bw.resize(upscale_size)
    bw = bw.point(lambda p: 255 if p > 170 else 0)
    variants.append(bw)

    for idx, variant in enumerate(variants):
        with tempfile.NamedTemporaryFile(prefix=f"ode-import-ocr-v{idx}-", suffix=".png", delete=False) as handle:
            variant.save(handle.name, format="PNG")
            temp_paths.append(handle.name)

    return temp_paths


def best_ocr_result_for_path(image_path: str) -> Dict[str, Any]:
    temp_paths = build_variant_paths(image_path)
    best: Optional[Dict[str, Any]] = None
    try:
        for path_item in temp_paths:
            current = run_ocr_on_path(path_item)
            if best is None or float(current.get("score") or 0.0) > float(best.get("score") or 0.0):
                best = current
        if best is None:
            raise RuntimeError("No OCR variants produced usable text")
        best.pop("score", None)
        return best
    finally:
        for extra_path in temp_paths[1:]:
            try:
                os.remove(extra_path)
            except Exception:
                pass


def main() -> int:
    try:
        raw = sys.stdin.read()
        image_bytes, filename = decode_payload(raw)
    except Exception as exc:
        return fail(f"invalid_payload: {exc}", 2)

    name_lower = filename.lower()
    ext = ".jpg"
    if name_lower.endswith(".png"):
        ext = ".png"
    elif name_lower.endswith(".webp"):
        ext = ".webp"
    elif name_lower.endswith(".jpeg"):
        ext = ".jpeg"

    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="ode-import-ocr-", suffix=ext, delete=False) as handle:
            handle.write(image_bytes)
            temp_path = handle.name

        result = best_ocr_result_for_path(temp_path)
        emit(result)
        return 0
    except Exception as exc:
        return fail(f"ocr_failed: {exc}", 3)
    finally:
        if temp_path:
            try:
                os.remove(temp_path)
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
