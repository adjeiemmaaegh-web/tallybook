import type { TallybookDB } from "@/db/TallybookDB";
import { getCustomerDebtSummary } from "@/features/credit/credit";
import { getCustomerSnapshot } from "@/features/customers/customers";
import { formatMinorAmount, getInventorySnapshot, parseAmountToMinor } from "@/features/inventory/inventory";
import { getPurchasesSnapshot } from "@/features/purchases/purchases";
import { matchEntity } from "./entityMatcher";

export interface DryRunSaleInput { productText: string; quantity: number; customerText?: string; credit?: boolean }
export interface DryRunSaleResult { productName: string; quantity: number; currentStock: number; resultingStock: number; saleTotalMinor: number; currentDebtMinor?: number; resultingDebtMinor?: number; text: string }
export interface DryRunPurchaseInput { supplierText: string; lines: Array<{ productText: string; quantity: number; unitCost: string }> }
export interface DryRunRepaymentInput { customerText: string; amount: string }

export async function simulateSale(input: DryRunSaleInput, currency: string, database: TallybookDB): Promise<DryRunSaleResult> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new Error("A dry run needs a positive whole quantity.");
  const snapshot = await getInventorySnapshot(database); const productMatch = matchEntity(input.productText, snapshot.products);
  if (productMatch.status !== "one") throw new Error(`I need one exact active product match for “${input.productText}” before I can simulate this sale.`);
  const product = productMatch.match; const resultingStock = product.stockQuantity - input.quantity;
  if (resultingStock < 0) throw new Error(`${product.name} has only ${product.stockQuantity} in stock, so this hypothetical sale would exceed stock.`);
  const saleTotalMinor = product.sellingPriceMinor * input.quantity;
  let currentDebtMinor: number | undefined; let resultingDebtMinor: number | undefined;
  if (input.credit && input.customerText) {
    const customerMatch = matchEntity(input.customerText, (await getCustomerSnapshot(database)).customers);
    if (customerMatch.status !== "one") throw new Error(`I need one exact active customer match for “${input.customerText}” before I can simulate credit.`);
    currentDebtMinor = (await getCustomerDebtSummary(customerMatch.match.id, currency, database)).outstandingMinor;
    resultingDebtMinor = currentDebtMinor + saleTotalMinor;
  }
  const debtLine = resultingDebtMinor === undefined ? "" : ` ${input.customerText}'s balance would change from ${formatMinorAmount(currentDebtMinor!, currency)} to ${formatMinorAmount(resultingDebtMinor, currency)}.`;
  return { productName: product.name, quantity: input.quantity, currentStock: product.stockQuantity, resultingStock, saleTotalMinor, currentDebtMinor, resultingDebtMinor, text: `Dry run — nothing will be saved. ${product.name} stock would change from ${product.stockQuantity} to ${resultingStock}. Sale total would be ${formatMinorAmount(saleTotalMinor, currency)}.${debtLine}` };
}

export async function simulatePurchase(input: DryRunPurchaseInput, currency: string, database: TallybookDB) {
  if (!input.lines.length) throw new Error("A purchase dry run needs at least one product.");
  const snapshot = await getInventorySnapshot(database); const suppliers = (await getPurchasesSnapshot(database)).suppliers; const supplierMatch = matchEntity(input.supplierText, suppliers);
  if (supplierMatch.status !== "one") throw new Error(`I need one exact active supplier match for “${input.supplierText}”.`);
  const lines = input.lines.map((line) => { const match = matchEntity(line.productText, snapshot.products); if (match.status !== "one") throw new Error(`I need one exact active product match for “${line.productText}”.`); if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error("Purchase quantities must be positive whole numbers."); const unitCostMinor = parseAmountToMinor(line.unitCost, currency); return { product: match.match, quantity: line.quantity, unitCostMinor }; });
  const totalMinor = lines.reduce((sum, line) => sum + line.quantity * line.unitCostMinor, 0);
  return { supplierName: supplierMatch.match.name, totalMinor, lines: lines.map((line) => ({ productName: line.product.name, currentStock: line.product.stockQuantity, resultingStock: line.product.stockQuantity + line.quantity, quantity: line.quantity, unitCostMinor: line.unitCostMinor })), text: `Dry run — nothing will be saved. A purchase from ${supplierMatch.match.name} would add ${lines.reduce((sum, line) => sum + line.quantity, 0)} units across ${lines.length} products and cost ${formatMinorAmount(totalMinor, currency)}.` };
}

export async function simulateRepayment(input: DryRunRepaymentInput, currency: string, database: TallybookDB) {
  const customerMatch = matchEntity(input.customerText, (await getCustomerSnapshot(database)).customers); if (customerMatch.status !== "one") throw new Error(`I need one exact active customer match for “${input.customerText}”.`);
  const currentDebtMinor = (await getCustomerDebtSummary(customerMatch.match.id, currency, database)).outstandingMinor; const amountMinor = parseAmountToMinor(input.amount, currency);
  if (amountMinor <= 0 || amountMinor > currentDebtMinor) throw new Error(`The simulated repayment must be greater than zero and no more than ${formatMinorAmount(currentDebtMinor, currency)}.`);
  return { customerName: customerMatch.match.name, currentDebtMinor, amountMinor, resultingDebtMinor: currentDebtMinor - amountMinor, text: `Dry run — nothing will be saved. ${customerMatch.match.name}'s balance would change from ${formatMinorAmount(currentDebtMinor, currency)} to ${formatMinorAmount(currentDebtMinor - amountMinor, currency)}.` };
}
