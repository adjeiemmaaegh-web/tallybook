/** Customer-list view helpers keep the debtor filter URL explicit without storing customer data outside the existing local ledger. */
export type CustomerListView = "all" | "owing";

export function customerListViewFromSearch(search: string): CustomerListView {
  return new URLSearchParams(search).get("view") === "owing" ? "owing" : "all";
}

export function customerListViewHref(view: CustomerListView) {
  return view === "owing" ? "/customers?view=owing" : "/customers";
}
