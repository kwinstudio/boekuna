"""On-device OCR (Apple Vision) versus server OCR (RapidOCR), same fixtures, same parser.

Runs the frozen V5 document benchmark twice: once with the processor's own RapidOCR,
once with processor.ocr_rows replaced by Apple Vision through the iOS app's
LocalFirstOCR.swift (compiled into a small CLI). Everything after OCR, the existing
Document Intelligence parser and financial validation, is identical. This answers
"is Vision good enough to feed the existing pipeline", not "is it as good on an iPhone":
it runs on a macOS CI runner, which uses the same Vision framework but other hardware.

Usage: python tests/ios-vision-ocr-benchmark.py --cli <VisionOCRBenchmarkCLI> --out <dir>
"""
import argparse
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ocr_v5", ROOT / "tests" / "document-ocr-v5-benchmark.test.py")
v5 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v5)
processor = v5.processor


class VisionRows:
    """processor.ocr_rows replacement: PIL image in, processor OCR rows out."""

    def __init__(self, cli):
        self.proc = subprocess.Popen([cli, "rows"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        self.tmp = tempfile.TemporaryDirectory()
        self.calls = []

    def __call__(self, engine, image):
        path = Path(self.tmp.name) / f"page-{len(self.calls)}.png"
        image.convert("RGB").save(path)
        self.proc.stdin.write(str(path) + "\n")
        self.proc.stdin.flush()
        payload = json.loads(self.proc.stdout.readline())
        path.unlink(missing_ok=True)
        self.calls.append(payload["ms"])
        if payload.get("error"):
            raise RuntimeError("Vision OCR failed: " + payload["error"])
        return [{"box": r["box"], "text": r["text"], "confidence": float(r["confidence"])} for r in payload["rows"]]

    def close(self):
        self.proc.stdin.close()
        self.proc.wait(timeout=30)
        self.tmp.cleanup()


def run_engine(label, out):
    report = out / f"{label}.json"
    os.environ["BOOKUNA_OCR_V5_REPORT"] = str(report)
    try:
        v5.run()
        gate = "PASS"
    except AssertionError as exc:
        # The V5 gates are written for RapidOCR; for Vision they become findings, not a crash.
        gate = "FAIL: " + str(exc)[:300]
    payload = json.loads(report.read_text())
    payload["gate"] = gate
    return payload


def device_reader(cli, out):
    """Full on-device reader (orientation, tiling, PDF text first, page rendering) per fixture."""
    folder = out / "fixtures"
    folder.mkdir(parents=True, exist_ok=True)
    paths = []
    for case in v5.cases():
        ext = ".pdf" if case["kind"] == "pdf" else ".jpg"
        path = folder / (case["id"] + ext)
        path.write_bytes(case["raw"])
        paths.append(path)
    rows = []
    for path in paths:
        done = subprocess.run([cli, "doc", str(path)], capture_output=True, text=True, timeout=300)
        if done.returncode != 0:
            rows.append({"file": path.name, "error": done.stderr[-300:]})
            continue
        rows.append(json.loads(done.stdout.strip().splitlines()[-1]))
    return rows


def summarize(rapid, vision, reader, vision_calls):
    def p(values, q):
        return round(v5.percentile(values, q), 1) if values else None

    rapid_by_id = {r["id"]: r for r in rapid["records"]}
    regressions, improvements = [], []
    for record in vision["records"]:
        base = rapid_by_id[record["id"]]
        for field, status in record["statuses"].items():
            before = base["statuses"].get(field)
            ok_before, ok_after = before in {"EXACT", "NORMALIZED"}, status in {"EXACT", "NORMALIZED"}
            if ok_before and not ok_after:
                regressions.append({"id": record["id"], "field": field, "rapidocr": before, "vision": status,
                                    "expected": next(c for c in v5.cases() if c["id"] == record["id"])["expected"].get(field),
                                    "actual": record["actual"].get(field)})
            if ok_after and not ok_before:
                improvements.append({"id": record["id"], "field": field})
    ocr_cases = [r["id"] for r in rapid["records"] if r["ocrPasses"] > 0]
    single = [r["ms"] for r in reader if "ms" in r and r.get("pageCount") == 1]
    multi = [r["ms"] for r in reader if "ms" in r and (r.get("pageCount") or 0) > 1]
    vision_pages = [ms for r in reader if "pageMs" in r for ms, src in zip(r["pageMs"], r["sources"]) if src == "vision"]
    return {
        "note": "macOS CI runner with Apple Vision; same framework as iOS, not iPhone hardware",
        "documents": vision["documents"],
        "documentsNeedingOcr": len(ocr_cases),
        "fullyCorrect": {"rapidocr": rapid["fullyCorrectDocuments"], "vision": vision["fullyCorrectDocuments"]},
        "fieldStatus": {"rapidocr": rapid["fieldStatus"], "vision": vision["fieldStatus"]},
        "reviewRequired": {"rapidocr": rapid["reviewRequiredDocuments"], "vision": vision["reviewRequiredDocuments"]},
        "pipelineMs": {"rapidocr": {"p50": rapid["p50Ms"], "p95": rapid["p95Ms"]},
                       "vision": {"p50": vision["p50Ms"], "p95": vision["p95Ms"]}},
        "visionCallMs": {"p50": p(vision_calls, .5), "p95": p(vision_calls, .95), "calls": len(vision_calls)},
        "deviceReaderMs": {"singlePage": {"p50": p(single, .5), "p95": p(single, .95), "n": len(single)},
                           "multiPage": {"p50": p(multi, .5), "p95": p(multi, .95), "n": len(multi)},
                           "visionPage": {"p50": p(vision_pages, .5), "p95": p(vision_pages, .95), "n": len(vision_pages)}},
        "deviceReaderErrors": [r for r in reader if "error" in r],
        "digitalPdfWithoutOcr": all(r.get("sources") == ["pdf-text"] * r.get("pageCount", 0)
                                    for r in reader if r.get("file", "").split(".")[0] in
                                    {c["id"] for c in v5.cases() if c.get("expect_no_ocr")}),
        "gates": {"rapidocr": rapid["gate"], "vision": vision["gate"]},
        "regressions": regressions,
        "improvements": improvements,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cli", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    rapid = run_engine("rapidocr", out)
    vision_rows = VisionRows(args.cli)
    original = processor.ocr_rows
    processor.ocr_rows = vision_rows
    try:
        vision = run_engine("vision", out)
    finally:
        processor.ocr_rows = original
        vision_rows.close()
    reader = device_reader(args.cli, out)
    (out / "device-reader.json").write_text(json.dumps(reader, indent=2), encoding="utf-8")
    summary = summarize(rapid, vision, reader, vision_rows.calls)
    (out / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print("IOS_VISION_BENCHMARK_JSON=" + json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    sys.exit(main())
