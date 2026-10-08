"""Supplier / customer role regressions through the existing parser.

Synthetic documents only. The full scenario set and the BEFORE/AFTER grading
live in tests/document-party-roles-benchmark.py; this file turns the
benchmark into hard assertions plus a few unit-level checks.
"""
import importlib.util
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, os.getenv('BOOKUNA_PROCESSOR_DIR', str(ROOT / 'kwinest/docprocessor')))
import app as p  # noqa: E402

_spec = importlib.util.spec_from_file_location('party_benchmark', ROOT / 'tests/document-party-roles-benchmark.py')
bm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bm)

SCENARIOS = bm.scenarios()
# Known, reported limitations (field stays empty for review, never a wrong value).
KNOWN_MISSING = {
    ('07 Buitenlandse factuur (DE, 19% MwSt)', 'total'), ('07 Buitenlandse factuur (DE, 19% MwSt)', 'vatTotal'),
    ('13 Slecht gescande bon (foto)', 'total'), ('13 Slecht gescande bon (foto)', 'vatTotal'),
    ('H9 Briefstijl: eigen adres boven, leverancier onderaan', 'appParty'),
    ('H9 Briefstijl: eigen adres boven, leverancier onderaan', 'supplierName'),
}


@pytest.fixture(scope='module')
def report():
    return {r['scenario']: r for r in bm.run(bm.OWN)['scenarios']}


@pytest.mark.parametrize('name', [s[0] for s in SCENARIOS])
def test_scenario_has_no_wrong_field(report, name):
    row = report[name]
    wrong = {f: v for f, v in row['fields'].items() if v['grade'] == 'WRONG'}
    assert not wrong, wrong
    missing = {f for f, v in row['fields'].items() if v['grade'] == 'MISSING' and (name, f) not in KNOWN_MISSING}
    assert not missing, {f: row['fields'][f] for f in missing}


def test_own_company_never_becomes_the_supplier_of_a_purchase(report):
    for name, row in report.items():
        party = row['fields'].get('appParty', {})
        if party.get('expected') and bm.norm_name(party['expected']) != bm.norm_name(bm.OWN['name']):
            assert bm.norm_name(party.get('actual')) != bm.norm_name(bm.OWN['name']), name


@pytest.mark.parametrize('name', ['H5 Twee naamblokken zonder bewijs (niet eigen bedrijf)',
                                  '23 Briefstijl op naam van de eigenaar'])
def test_uncertain_supplier_is_routed_to_review(report, name):
    row = report[name]
    assert row['fields']['supplierName']['actual'] is None
    assert 'supplierName' in row['reviewFields']


# ---------- unit level ----------

@pytest.mark.parametrize('raw,expected', [
    ('Van: Coolblue B.V.', 'Coolblue B.V.'),
    ('Van Dam Schilders', 'Van Dam Schilders'),
    ('Tomas BV', 'Tomas BV'),
    ('Klantenservice', 'Klantenservice'),
    ('Factuuradres Kwinest', 'Kwinest'),
    ('Bill to: Kwinest', 'Kwinest'),
])
def test_label_prefix_keeps_names_that_start_with_a_label_word(raw, expected):
    assert p._clean_party_candidate(raw) == expected


@pytest.mark.parametrize('line', ['Factuuradres Afleveradres', 'Van: Aan:', 'Bill to', 'Rechnungsempfänger:'])
def test_label_only_rows_are_never_names(line):
    assert p.party_label_only(line)


def test_ocr_misread_of_own_name_still_counts_as_own_company():
    assert p.own_matches({'name': 'Kwlnest'}, {'name': 'Kwinest'})
    assert not p.own_matches({'name': 'Kwest'}, {'name': 'Kwinest'})
    assert not p.own_matches({'name': 'Coolblue B.V.'}, {'name': 'Kwinest'})


def test_carrier_invoice_sender_is_not_the_issuer():
    # DHL/PostNL: "Verzender" is the billed shipper.
    text = ('Factuur\nFactuurnummer: 1\nDatum: 01-10-2026 DHL Parcel B.V.\nVerzender:\nMijn Webshop\n'
            'Subtotaal €3,26\nBtw 21% €0,69\nTotaal €3,95')
    doc = dict(kind='pdf', pageCount=1, text=text, nativeText=text, tables=[], layout=[], ocrPages=[], warnings=[])
    r = p.heuristic_extract(doc, 'x.pdf', {})
    assert r.customer.name == 'Mijn Webshop'
    assert r.supplier.name != 'Mijn Webshop'


def test_rotated_ocr_boxes_are_ignored_for_layout():
    page = {'words': [{'box': [[10, 10], [20, 10], [20, 200], [10, 200]], 'text': 'abc'},
                      {'box': [[30, 10], [40, 10], [40, 200], [30, 200]], 'text': 'def'}]}
    assert p.layout_page_words(page) == []
