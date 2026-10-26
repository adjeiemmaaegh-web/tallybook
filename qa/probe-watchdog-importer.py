"""Read-only compatibility probe against a separately supplied Watchdog source checkout.

Usage: python qa/probe-watchdog-importer.py WATCHDOG_SOURCE_DIRECTORY
No Watchdog database is opened or modified.
"""
import hashlib
import csv
import io
import json
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    watchdog = Path(sys.argv[1]).resolve()
    sys.path.insert(0, str(watchdog / "src"))
    from cvapp.integrations.pos import FIELDS, KINDS, parse_canonical_csv
    from cvapp.integrations.tallybook_adapter import prepare_batch

    mapping = json.dumps({"contract_version": 1, "fields": {key: key for key in FIELDS}}).encode()
    results = []
    for filename in ("tallybook-watchdog-preview-v1.json", "tallybook-watchdog-legacy.csv",
                     "tallybook-watchdog-canonical-pos-v1.csv"):
        source = root / "qa" / "fixtures" / filename
        payload = source.read_bytes()
        entry = {"file": filename, "sha256": hashlib.sha256(payload).hexdigest(), "bytes": len(payload)}
        for name, importer in (
            ("canonical_csv", lambda: parse_canonical_csv(payload)),
            ("mapped_csv", lambda: prepare_batch(payload, mapping, selected_store="fixture-shop")),
        ):
            try:
                value = importer()
                entry[name] = {"accepted": True, "rows": len(value) if name == "canonical_csv" else value.row_count}
            except (ValueError, UnicodeError) as error:
                entry[name] = {"accepted": False, "error": str(error)}
        results.append(entry)
    canonical = results[-1]
    assert canonical['canonical_csv'] == {'accepted': True, 'rows': 3}
    assert canonical['mapped_csv'] == {'accepted': True, 'rows': 3}
    control = io.StringIO(newline="")
    writer = csv.DictWriter(control, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerow({"external_id": "control-sale", "kind": "sale", "occurred_at": "2026-10-24T12:00:00Z",
                     "store_id": "fixture-shop", "register_id": "", "reference": "FIXTURE-001",
                     "amount": "20.00", "currency": "GHS"})
    control_rows = parse_canonical_csv(control.getvalue().encode())
    print(json.dumps({
        "watchdog_pos_sha256": hashlib.sha256((watchdog / "src/cvapp/integrations/pos.py").read_bytes()).hexdigest(),
        "watchdog_mapping_sha256": hashlib.sha256((watchdog / "src/cvapp/integrations/tallybook_adapter.py").read_bytes()).hexdigest(),
        "canonical_fields": FIELDS,
        "supported_kinds": sorted(KINDS),
        "canonical_control_rows": len(control_rows),
        "results": results,
    }, indent=2))


if __name__ == "__main__":
    main()
