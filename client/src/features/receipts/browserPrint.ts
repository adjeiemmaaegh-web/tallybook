/** Browser print adapter: supports installed printer drivers, including configured thermal printers. */
export async function printReceiptInBrowser(showReceipt: () => void): Promise<"opened" | "unsupported"> {
  if (typeof window === "undefined" || typeof window.print !== "function") return "unsupported";
  showReceipt();
  // Allow the receipt dialog to mount before the print layout is captured.
  await new Promise<void>(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
  window.print();
  return "opened"; // Printing/opening a dialog is NOT confirmation that paper was printed.
}
