"""Exercise the benchmark orchestrator without macOS or model downloads.

Only the platform OCR boundary is substituted. The real main(), report writing,
gate handling and processor restoration are executed.
"""
import contextlib
import io
import json
import os
import runpy
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch
import importlib.util

SCRIPT = Path(__file__).with_name("ios-vision-ocr-benchmark.py")


class BenchmarkGateTests(unittest.TestCase):
    def exercise(self, rapid_gate, vision_gate):
        original_rows = object()
        processor = types.SimpleNamespace(ocr_rows=original_rows)
        fake_v5 = types.SimpleNamespace(processor=processor)
        loader = types.SimpleNamespace(create_module=lambda spec: None,
                                       exec_module=lambda module: module.__dict__.update(fake_v5.__dict__))
        real_spec = importlib.util.spec_from_file_location

        def spec(name, path, *args, **kwargs):
            if name == "ocr_v5":
                return importlib.util.spec_from_loader(name, loader)
            return real_spec(name, path, *args, **kwargs)

        # The imported benchmark needs the processor and native libraries. This
        # suite isolates the command's exit contract from those external engines.
        with patch("importlib.util.spec_from_file_location", side_effect=spec):
            namespace = runpy.run_path(str(SCRIPT))
        globals_ = namespace["main"].__globals__
        closed = []

        class Rows:
            def __init__(self, cli):
                self.calls = []

            def close(self):
                closed.append(True)

        gates = {"rapidocr": rapid_gate, "vision": vision_gate}

        def run_engine(label, out):
            def write_report():
                Path(globals_["os"].environ["BOOKUNA_OCR_V5_REPORT"]).write_text("{}")
                if gates[label] != "PASS":
                    raise AssertionError(gates[label].removeprefix("FAIL: "))
            globals_["v5"].run = write_report
            return namespace["run_engine"](label, out)

        globals_.update(VisionRows=Rows, run_engine=run_engine,
                        device_reader=lambda cli, out: [],
                        summarize=lambda rapid, vision, reader, calls: {"gates": {"rapidocr": rapid["gate"], "vision": vision["gate"]}})
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict(os.environ), patch.object(sys, "argv", [str(SCRIPT), "--cli", "unused", "--out", folder]), contextlib.redirect_stdout(io.StringIO()) as stdout:
                status = namespace["main"]()
            summary = json.loads((Path(folder) / "summary.json").read_text())
        self.assertIs(processor.ocr_rows, original_rows)
        self.assertEqual(closed, [True])
        self.assertIn("IOS_VISION_BENCHMARK_JSON=", stdout.getvalue())
        self.assertEqual(summary["gates"], gates)
        return status

    def test_failed_server_gate_returns_failure_and_retains_evidence(self):
        self.assertEqual(self.exercise("FAIL: missing gross", "PASS"), 1)

    def test_vision_findings_do_not_fail_passing_server_gate(self):
        self.assertEqual(self.exercise("PASS", "FAIL: missing iban"), 0)

    def test_both_passing_returns_success(self):
        self.assertEqual(self.exercise("PASS", "PASS"), 0)

    def test_both_failing_still_fails_server_gate(self):
        self.assertEqual(self.exercise("FAIL: missing gross", "FAIL: missing iban"), 1)


if __name__ == "__main__":
    unittest.main()
