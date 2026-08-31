/** Tactile Ledger design reminder: archived stock is a visible record category, not a hidden destination at the bottom of the page. */
import { ArchiveRestore } from "lucide-react";

interface ArchivedRecordsAccessProps {
  count: number;
  onOpen: () => void;
}

export function ArchivedRecordsAccess({ count, onOpen }: ArchivedRecordsAccessProps) {
  return <button className={count ? "archive-access-control" : "archive-access-control archive-access-control-empty"} type="button" onClick={onOpen}><ArchiveRestore className="h-4 w-4" aria-hidden="true" />Archived records <span>{count}</span></button>;
}
