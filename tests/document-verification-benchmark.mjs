import fs from "node:fs";
import assert from "node:assert/strict";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Usage: node tests/document-verification-benchmark.mjs <manifest.json>");
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.ok(
  Array.isArray(manifest.documents) && manifest.documents.length > 0,
  "Benchmark requires at least one labeled anonymized document",
);

const CORE_FIELDS = ["party", "issueDate", "description", "net", "vatRate", "vatAmount", "gross"];
const FINANCIAL_FIELDS = new Set(["net", "vatRate", "vatAmount", "gross"]);
const HIGH_CONFIDENCE = Number(manifest.thresholds?.highConfidence ?? 90);

const normText = (v) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function missing(v) {
  return v === null || v === undefined || String(v).trim() === "";
}

// Money equality is exact to eurocents. Do not use percentage-based tolerances:
// a five-cent financial error must remain visible to the benchmark.
function decimalParts(v, scale = 2) {
  if (missing(v)) return null;
  let s = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(s)) return null;
  let negative = false;
  if (s[0] === "-" || s[0] === "+") {
    negative = s[0] === "-";
    s = s.slice(1);
  }
  let [whole, fraction = ""] = s.split(".");
  fraction = (fraction + "0".repeat(scale + 1)).slice(0, scale + 1);
  const guard = Number(fraction[scale] || "0");
  let minor =
    BigInt(whole || "0") * 10n ** BigInt(scale) +
    BigInt((fraction.slice(0, scale) || "0").padEnd(scale, "0"));
  if (guard >= 5) minor += 1n;
  return negative ? -minor : minor;
}

function same(field, a, b) {
  if (missing(a) && missing(b)) return true;
  if (missing(a) || missing(b)) return false;

  if (["net", "vatAmount", "gross"].includes(field)) {
    const x = decimalParts(a, 2);
    const y = decimalParts(b, 2);
    return x !== null && y !== null && x === y;
  }

  if (field === "vatRate") {
    const x = decimalParts(a, 3);
    const y = decimalParts(b, 3);
    return x !== null && y !== null && x === y;
  }

  const x = normText(a);
  const y = normText(b);
  return (
    x === y ||
    (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)))
  );
}

function fieldStatus(field, value, truth) {
  if (missing(value) && !missing(truth)) return "missing";
  return same(field, value, truth) ? "correct" : "wrong";
}

function addFieldCount(map, field, status) {
  map[field] ??= { correct: 0, wrong: 0, missing: 0, total: 0 };
  map[field][status]++;
  map[field].total++;
}

function pct(n, d) {
  return d ? Math.round((n / d) * 1000) / 10 : null;
}

function moneyMinor(v) {
  return decimalParts(v, 2);
}

function arithmeticIssues(snapshot) {
  const issues = [];
  if (!snapshot || typeof snapshot !== "object") return issues;

  const net = moneyMinor(snapshot.net);
  const vat = moneyMinor(snapshot.vatAmount);
  const gross = moneyMinor(snapshot.gross);
  if (net !== null && vat !== null && gross !== null && net + vat !== gross) {
    issues.push("net_plus_vat_mismatch");
  }

  // Line-level sums are only hard invariants when the labeled document explicitly
  // says they should be. Discounts, fees and document-level adjustments can make
  // a raw line sum differ from the financial subtotal without being an OCR error.
  if (
    snapshot.validation?.requireLineItemSum === true &&
    Array.isArray(snapshot.lineItems) &&
    snapshot.lineItems.length
  ) {
    let sum = 0n;
    let complete = true;
    for (const line of snapshot.lineItems) {
      const amount = moneyMinor(line?.total);
      if (amount === null) {
        complete = false;
        break;
      }
      sum += amount;
    }
    if (complete && net !== null && sum !== net) issues.push("line_sum_mismatch");
  }

  // VAT may legally/document-wise be rounded per line or after aggregation per
  // VAT-rate group. Only enforce exact sum(vatLines) == vatTotal when the ground
  // truth declares that this document uses a per-line/group representation where
  // the printed VAT lines are expected to reconcile exactly.
  if (
    snapshot.validation?.requireVatLineSum === true &&
    Array.isArray(snapshot.vatLines) &&
    snapshot.vatLines.length
  ) {
    let sum = 0n;
    let complete = true;
    for (const line of snapshot.vatLines) {
      const amount = moneyMinor(line?.vatAmount);
      if (amount === null) {
        complete = false;
        break;
      }
      sum += amount;
    }
    if (complete && vat !== null && sum !== vat) issues.push("vat_line_sum_mismatch");
  }

  return issues;
}

function normalizedVatLines(value) {
  if (!Array.isArray(value)) return null;
  const rows = [];
  for (const line of value) {
    const rate = decimalParts(line?.rate, 3);
    const vatAmount = decimalParts(line?.vatAmount, 2);
    const taxableAmount = missing(line?.taxableAmount)
      ? null
      : decimalParts(line?.taxableAmount, 2);
    if (rate === null || vatAmount === null || (!missing(line?.taxableAmount) && taxableAmount === null)) {
      return null;
    }
    rows.push({
      rate: rate.toString(),
      taxableAmount: taxableAmount === null ? null : taxableAmount.toString(),
      vatAmount: vatAmount.toString(),
    });
  }
  return rows.sort((a, b) =>
    a.rate.localeCompare(b.rate) ||
    String(a.taxableAmount).localeCompare(String(b.taxableAmount)) ||
    a.vatAmount.localeCompare(b.vatAmount)
  );
}

function vatBreakdownStatus(value, truth) {
  if (!Array.isArray(truth)) return null;
  if (!Array.isArray(value) || value.length === 0) return truth.length ? "missing" : "correct";
  const a = normalizedVatLines(value);
  const b = normalizedVatLines(truth);
  if (!a || !b) return "wrong";
  return JSON.stringify(a) === JSON.stringify(b) ? "correct" : "wrong";
}

function timingStats(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    n: sorted.length,
    avgMs: Math.round(avg),
    p50Ms: Math.round(sorted[Math.floor((sorted.length - 1) * 0.5)]),
    p95Ms: Math.round(sorted[Math.floor((sorted.length - 1) * 0.95)]),
    maxMs: Math.round(sorted.at(-1)),
  };
}

const perField = {};
const vatBreakdown = { correct: 0, wrong: 0, missing: 0, total: 0 };
const documentsDetail = [];
let pass1ImportantFieldErrors = 0;
let detectedFinancialErrors = 0;
let silentFinancialErrors = 0;
let falseHighConfidence = 0;
let highConfidenceClaims = 0;
let pass2Fixes = 0;
let pass2IntroducedErrors = 0;
let pass2IntroducedSilentErrors = 0;
const pass1Durations = [];
const pass2Durations = [];
const totalReviewDurations = [];

for (const doc of manifest.documents) {
  assert.ok(doc.id && doc.groundTruth && doc.pass1, `Missing benchmark data for ${doc.id || "unknown"}`);

  const truth = doc.groundTruth || {};
  const pass1 = doc.pass1 || {};
  const pass2 = doc.pass2 || null;
  const reviewFlags = new Set([
    ...(doc.flaggedFields || []),
    ...(doc.reviewFlaggedFields || []),
    ...(doc.financialIssues || []).flatMap((x) =>
      typeof x === "string" ? [x] : [x?.field].filter(Boolean),
    ),
  ]);

  const truthIssues = arithmeticIssues(truth);
  assert.equal(
    truthIssues.length,
    0,
    `Ground truth arithmetic invalid for ${doc.id}: ${truthIssues.join(",")}`,
  );

  let importantCorrections = 0;
  let financialCorrections = 0;
  const fields = {};

  for (const field of CORE_FIELDS) {
    const pass1Status = fieldStatus(field, pass1[field], truth[field]);
    const pass2Status = pass2 ? fieldStatus(field, pass2[field], truth[field]) : null;
    addFieldCount(perField, field, pass1Status);

    const confidence = Number(
      doc.pass1FieldConfidence?.[field] ?? pass1.fieldConfidence?.[field] ?? 0,
    );
    if (confidence >= HIGH_CONFIDENCE) {
      highConfidenceClaims++;
      if (pass1Status !== "correct") falseHighConfidence++;
    }

    if (pass1Status !== "correct") {
      pass1ImportantFieldErrors++;
      if (FINANCIAL_FIELDS.has(field)) financialCorrections++;
      else importantCorrections++;

      // A PASS1/PASS2 disagreement alone is NOT counted as detection.
      // The final review/validation layer must explicitly flag the field/problem.
      const caught =
        reviewFlags.has(field) ||
        reviewFlags.has("financial") ||
        reviewFlags.has("financial_total") ||
        reviewFlags.has("cross_validation");

      if (FINANCIAL_FIELDS.has(field)) {
        if (caught) detectedFinancialErrors++;
        else silentFinancialErrors++;
      }

      if (pass2 && pass2Status === "correct") pass2Fixes++;
    } else if (pass2 && pass2Status !== "correct") {
      pass2IntroducedErrors++;
      const caught =
        reviewFlags.has(field) ||
        reviewFlags.has("financial") ||
        reviewFlags.has("cross_validation");
      if (!caught) pass2IntroducedSilentErrors++;
    }

    fields[field] = {
      pass1: pass1Status,
      pass2: pass2Status,
      confidence: confidence || null,
      flagged: reviewFlags.has(field),
    };
  }

  const pass1VatBreakdown = vatBreakdownStatus(pass1.vatLines, truth.vatLines);
  const pass2VatBreakdown = pass2 ? vatBreakdownStatus(pass2.vatLines, truth.vatLines) : null;
  if (pass1VatBreakdown) {
    vatBreakdown[pass1VatBreakdown]++;
    vatBreakdown.total++;
    if (pass1VatBreakdown !== "correct") {
      financialCorrections++;
      const caught =
        reviewFlags.has("vatLines") ||
        reviewFlags.has("mixedRates") ||
        reviewFlags.has("financial") ||
        reviewFlags.has("cross_validation");
      if (caught) detectedFinancialErrors++;
      else silentFinancialErrors++;
      if (pass2 && pass2VatBreakdown === "correct") pass2Fixes++;
    } else if (pass2 && pass2VatBreakdown !== "correct") {
      pass2IntroducedErrors++;
      const caught =
        reviewFlags.has("vatLines") ||
        reviewFlags.has("mixedRates") ||
        reviewFlags.has("financial") ||
        reviewFlags.has("cross_validation");
      if (!caught) pass2IntroducedSilentErrors++;
    }
  }

  let category = "fully_correct";
  if (doc.unusable === true) category = "unusable";
  else if (financialCorrections > 0) category = "important_financial_correction";
  else if (importantCorrections > 0) category = "small_correction";

  documentsDetail.push({
    id: doc.id,
    category,
    financialCorrections,
    importantCorrections,
    pass1ArithmeticIssues: arithmeticIssues(pass1),
    pass2ArithmeticIssues: pass2 ? arithmeticIssues(pass2) : [],
    vatBreakdown: {
      pass1: pass1VatBreakdown,
      pass2: pass2VatBreakdown,
      flagged: reviewFlags.has("vatLines") || reviewFlags.has("mixedRates"),
    },
    fields,
  });

  if (Number.isFinite(Number(doc.timings?.pass1Ms))) {
    pass1Durations.push(Number(doc.timings.pass1Ms));
  }
  if (Number.isFinite(Number(doc.timings?.pass2Ms))) {
    pass2Durations.push(Number(doc.timings.pass2Ms));
  }
  if (Number.isFinite(Number(doc.timings?.totalReviewMs))) {
    totalReviewDurations.push(Number(doc.timings.totalReviewMs));
  }
}

const categories = Object.fromEntries(
  ["fully_correct", "small_correction", "important_financial_correction", "unusable"].map(
    (key) => [key, documentsDetail.filter((d) => d.category === key).length],
  ),
);

const perFieldOutput = {};
for (const [field, value] of Object.entries(perField)) {
  perFieldOutput[field] = {
    ...value,
    accuracyPct: pct(value.correct, value.total),
    correctionPct: pct(value.wrong + value.missing, value.total),
  };
}

const failures = Array.isArray(manifest.failureCases) ? manifest.failureCases : [];
const unsafeFailures = failures
  .filter(
    (x) =>
      !(
        x.noGuess === true &&
        x.reviewable === true &&
        x.flowSurvives === true
      ),
  )
  .map((x) => x.id || x.type || "unknown");

const output = {
  generatedAt: new Date().toISOString(),
  documents: documentsDetail.length,
  perField: perFieldOutput,
  vatBreakdown: {
    ...vatBreakdown,
    accuracyPct: pct(vatBreakdown.correct, vatBreakdown.total),
    correctionPct: pct(vatBreakdown.wrong + vatBreakdown.missing, vatBreakdown.total),
  },
  documentOutcome: {
    ...categories,
    fullyCorrectPct: pct(categories.fully_correct, documentsDetail.length),
    manualImportantCorrectionPct: pct(
      categories.important_financial_correction + categories.small_correction,
      documentsDetail.length,
    ),
    importantFinancialCorrectionPct: pct(
      categories.important_financial_correction,
      documentsDetail.length,
    ),
  },
  safety: {
    pass1ImportantFieldErrors,
    financialErrorDetectionRatePct: pct(
      detectedFinancialErrors,
      detectedFinancialErrors + silentFinancialErrors,
    ),
    silentFinancialErrors,
    falseHighConfidence,
    highConfidenceClaims,
    falseHighConfidenceRatePct: pct(falseHighConfidence, highConfidenceClaims),
    pass2Fixes,
    pass2IntroducedErrors,
    pass2IntroducedSilentErrors,
  },
  performance: {
    pass1: timingStats(pass1Durations),
    pass2: timingStats(pass2Durations),
    totalReview: timingStats(totalReviewDurations),
  },
  providerFailureCases: {
    total: failures.length,
    safe: failures.length - unsafeFailures.length,
    unsafe: unsafeFailures,
  },
  documentsDetail,
};

console.log(JSON.stringify(output, null, 2));
