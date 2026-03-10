#!/usr/bin/env python3
import base64
import json
import os
import sys
import tempfile
from typing import Any, Dict, List, Tuple


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


def run_ocr_on_path(image_path: str) -> Dict[str, Any]:
    try:
        from paddleocr import PaddleOCR  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"paddleocr import failed: {exc}") from exc

    ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    result = ocr.ocr(image_path, cls=True)

    lines: List[str] = []
    confs: List[float] = []
    for block in result or []:
        for row in block or []:
            if not row or len(row) < 2:
                continue
            text_part = row[1][0] if isinstance(row[1], (list, tuple)) and len(row[1]) > 0 else ""
            conf_part = row[1][1] if isinstance(row[1], (list, tuple)) and len(row[1]) > 1 else 0
            text = str(text_part or "").strip()
            try:
                conf = float(conf_part or 0)
            except Exception:
                conf = 0.0
            if text:
                lines.append(text)
                confs.append(max(0.0, min(1.0, conf)))

    joined = "\n".join(lines).strip()
    avg_conf = sum(confs) / len(confs) if confs else 0.0
    return {
        "ok": True,
        "engine": "paddleocr",
        "text": joined,
        "lineCount": len(lines),
        "avgConfidence": round(avg_conf, 6),
    }


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

        result = run_ocr_on_path(temp_path)
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
