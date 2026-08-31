# Local Backup and Restore

## What a backup contains

A Tallybook backup is a readable `.json` file containing the owner’s local business profile, products, inventory movements, customers, sales, sale lines, sale payments, receipts, customer activity, later debt repayments, and configured Mobile Money providers. Mobile Money payment rows may include their historical provider-name snapshot and optional reference. It also includes a backup-format version and the local database-schema version needed to check compatibility. A version-7 backup without the newer provider list remains restorable with an empty provider list.

## Create a backup

Open **Backup** and choose **Download local backup**. Save the downloaded file in a place you control, such as device storage or another file location you trust. The product does not automatically send this file anywhere.

## Restore a backup

Open **Backup**, choose a Tallybook `.json` file, review its business name and record counts, then choose **Restore backup**. Tallybook asks for an explicit replacement confirmation. A successful restore replaces the current local business records on this device with the selected file in one local database transaction.

> **Important:** Download a fresh backup before restoring. Restoring is a replacement, not a merge; it cannot be undone inside the app.

## Safety boundary

The backup file is not encrypted by Tallybook and may contain personal and business information. Keep it private. Stage 9 does not add cloud storage, automatic sync, an account, or a remote copy.

## Stage 12 release handover

The release candidate includes an owner start guide, troubleshooting guide, and release checklist alongside this restore contract. Before publishing or moving to another device, the owner should download a fresh backup, test the file with the backup workspace, and keep it private. The checklist never treats a readable JSON backup as encrypted or as a remote safety copy.
