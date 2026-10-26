"""Exercise the real Watchdog authorization and SQLite importer with Tallybook's synthetic CSV.

Usage: python -B qa/test-watchdog-import-roundtrip.py WATCHDOG_SOURCE_DIRECTORY
Only a disposable database under the Tallybook workspace is created.
"""
import json
import sys
import tempfile
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    watchdog = Path(sys.argv[1]).resolve()
    sys.path.insert(0, str(watchdog / "src"))
    from cvapp.integrations.multistore import MultiStoreConsole
    from cvapp.integrations.pos import parse_canonical_csv

    raw = (root / 'qa/fixtures/tallybook-watchdog-canonical-pos-v1.csv').read_bytes()
    downloaded = b'\xef\xbb\xbf' + raw  # Reports download adds the UTF-8 BOM.
    records = parse_canonical_csv(downloaded)
    assert len(records) == 3
    with tempfile.TemporaryDirectory(prefix='watchdog-import-', dir=root) as directory:
        console = MultiStoreConsole(Path(directory) / 'watchdog.sqlite3')
        console.bootstrap('admin', 'test-only-long-password')
        admin = console.login('admin', 'test-only-long-password')
        console.add_store(admin, 'fixture-shop', 'Fixture Shop')
        console.add_store(admin, 'other-shop', 'Other Shop')
        console.add_operator(admin, 'manager', 'test-only-manager-password', 'manager')
        console.add_operator(admin, 'viewer', 'test-only-viewer-password', 'viewer')
        console.grant(admin, 'manager', 'fixture-shop')
        console.grant(admin, 'viewer', 'fixture-shop')
        manager = console.login('manager', 'test-only-manager-password')
        viewer = console.login('viewer', 'test-only-viewer-password')
        inserted = console.import_business_csv(manager, 'fixture-shop', downloaded)
        replayed = console.import_business_csv(manager, 'fixture-shop', downloaded)
        saved = console.business_records(manager, 'fixture-shop')
        assert inserted == 3 and replayed == 0 and len(saved) == 3
        assert {row[0] for row in saved} == {row.external_id for row in records}
        assert len(console.business_records(admin, 'other-shop')) == 0

        wrong_store_denied = False
        try:
            console.import_business_csv(manager, 'other-shop', downloaded)
        except (PermissionError, ValueError):
            wrong_store_denied = True
        assert wrong_store_denied

        viewer_denied = False
        try:
            console.import_business_csv(viewer, 'fixture-shop', downloaded)
        except PermissionError:
            viewer_denied = True
        assert viewer_denied

        malformed_denied = False
        try:
            console.import_business_csv(manager, 'fixture-shop', raw.replace(b'20.00,GHS', b'not-money,GHS'))
        except ValueError:
            malformed_denied = True
        assert malformed_denied

        conflict = raw.replace(b'20.00,GHS', b'21.00,GHS')
        conflict_rolled_back = False
        try:
            console.import_business_csv(manager, 'fixture-shop', conflict)
        except ValueError:
            conflict_rolled_back = True
        assert conflict_rolled_back
        assert len(console.business_records(manager, 'fixture-shop')) == 3

        console.revoke(admin, 'manager', 'fixture-shop')
        revoked_denied = False
        try:
            console.import_business_csv(manager, 'fixture-shop', downloaded)
        except PermissionError:
            revoked_denied = True
        assert revoked_denied
        print(json.dumps({'source_file': 'tallybook-watchdog-canonical-pos-v1.csv',
                          'parsed': len(records), 'inserted': inserted, 'replayed_insertions': replayed,
                          'wrong_store_denied': wrong_store_denied,
                          'viewer_denied': viewer_denied,
                          'malformed_denied': malformed_denied,
                          'changed_payload_rolled_back': conflict_rolled_back,
                          'revoked_manager_denied': revoked_denied}, indent=2))


if __name__ == '__main__':
    main()
