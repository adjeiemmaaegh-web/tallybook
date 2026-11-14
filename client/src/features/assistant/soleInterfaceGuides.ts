/**
 * Explainable, safe first-time-user guidance.
 *
 * These replies are instructions rather than actions. Every "in chat" entry
 * names an already-supported assistant command; all other entries explicitly
 * disclose that the requested mutation must be done through a permissioned UI.
 */
import {prepareText} from "./text";
import type {AssistantReply} from "./types";

type Guide = {
  id: string;
  match: RegExp;
  title: string;
  route: string;
  summary: string;
  steps: readonly string[];
  inChat?: string;
};
const ROUTES = {
  business:"/business", customers:"/customers", stock:"/inventory", sales:"/sales",
  reports:"/reports", purchases:"/purchases", expenses:"/expenses",
  endOfDay:"/end-of-day", health:"/business-health", backup:"/backup",
  staff:"/staff", stores:"/stores", commerce:"/commerce", assistant:"/assistant",
  signin:"/signin", reset:"/reset-password", quotations:"/quotations",
} as const;

const FAQ_GUIDES:readonly Guide[]=[
  {id:"business-onboarding",match:/\b(?:set up|create|register|configure|start)\b.{0,30}\b(?:my\s+)?business\b|\bbusiness profile\b/i,
    title:"Setting up your business",route:ROUTES.business,
    summary:"If no local business exists, Clementia can now ask for the business name, country and type inside the chat. You must confirm before it is saved.",
    steps:["Open Clementia while signed in as required for your workspace.","Provide the business name, operating country and business type.","Review the currency chosen for that country; confirm explicitly."]},
  {id:"customer-create",match:/\b(?:add|create|register|save)\b.{0,35}\b(?:new\s+)?(?:customer|client)\b/i,
    title:"Adding a customer",route:ROUTES.customers,
    summary:"Clementia can prepare a customer record in chat. It asks for missing details and shows a preview.",
    steps:["Say “Add customer Ama Serwaa”.","Supply a phone number if requested.","Read the preview and choose Confirm only when the information is correct."],
    inChat:"Add customer Ama Serwaa"},
  {id:"supplier-create",match:/\b(?:add|create|register|save)\b.{0,35}\b(?:supplier|vendor|wholesaler)\b/i,
    title:"Adding a supplier",route:ROUTES.purchases,
    summary:"Clementia can prepare a supplier record in chat, then requests confirmation.",
    steps:["Say “Add supplier Accra Wholesalers”.","Provide contact information if needed.","Check the supplier identity and confirm the preview."],
    inChat:"Add supplier Accra Wholesalers"},
  {id:"category-create",match:/\b(?:add|create|register|save)\b.{0,35}\bcategor(?:y|ies)\b/i,
    title:"Adding a category",route:ROUTES.stock,
    summary:"Clementia can prepare product categories in chat.",
    steps:["Say “Add category Drinks”.","Check the proposed category name.","Confirm the preview to save it."],
    inChat:"Add category Drinks"},
  {id:"stock-receipt",match:/\b(?:receive|record|enter)\b.{0,35}\b(?:stock|delivery|inventory receipt)\b/i,
    title:"Receiving stock",route:ROUTES.purchases,
    summary:"Clementia can prepare a stock receipt from a supplier and ask for cost details.",
    steps:["Say “I received 10 eggs from Kofi Traders at 40 each”.","Answer any quantity, supplier or cost questions.","Confirm the proposed purchase and stock movement."],
    inChat:"Record a purchase"},
  {id:"stock-count",match:/\b(?:count|recount|stocktake|stock count)\b.{0,30}\b(?:stock|items?|products?|inventory|eggs|rice)\b/i,
    title:"Correcting a physical stock count",route:ROUTES.stock,
    summary:"Clementia can prepare a physical stock correction and asks for explicit approval.",
    steps:["Count the goods physically.","Say “I counted 25 eggs but we have 37”.","Verify and confirm the resulting stock adjustment."],
    inChat:"I counted 25 eggs but we have 37"},
  {id:"repayment",match:/\b(?:record|enter|log|take|receive)\b.{0,35}\b(?:customer payment|repayment|payment from customer)\b/i,
    title:"Recording a customer repayment",route:ROUTES.customers,
    summary:"Clementia can prepare repayment entries after checking the customer's current balance.",
    steps:["Say “Adwoa paid 100 cedis cash”.","Verify the customer, amount and payment method.","Confirm the repayment entry."],
    inChat:"Adwoa paid 100 cedis cash"},
  {id:"quotation",match:/\b(?:prepare|draft|make|create)\b.{0,35}\b(?:quote|quotation|estimate)\b/i,
    title:"Preparing a quotation",route:ROUTES.quotations,
    summary:"Clementia can prepare quotations from local records without issuing a financial sale.",
    steps:["Say “Prepare a quotation for Adwoa for 2 eggs”.","Review the customer and proposed lines.","Confirm the quotation draft; this is not a paid sale."],
    inChat:"Prepare a quotation for Adwoa for 2 eggs"},
  {id:"low-stock",match:/\b(?:find|see|show|check|review)\b.{0,30}\b(?:low stock|running low)\b/i,
    title:"Finding low stock",route:ROUTES.stock,
    summary:"Clementia can answer this question from local inventory thresholds.",
    steps:["Say “What is running low?”","Review the products at or below their configured thresholds.","Decide whether to record a stock receipt or purchase."],
    inChat:"What is running low?"},
  {id:"product-create",match:/\b(?:add|create|register|save)\b.{0,35}\b(?:new\s+)?(?:stock\s+item|product|item)\b/i,
    title:"Adding a product",route:ROUTES.stock,
    summary:"Clementia can prepare a product entry, using the local inventory service and an explicit confirmation preview.",
    steps:["Say “Add product Palm oil, price 12”.","Answer any questions about stock and category.","Check and confirm the proposed record before saving."],
    inChat:"Add product Palm oil, price 12"},
  {id:"sale",match:/\b(?:record|enter|create|make)\b.{0,35}\bsales?\b|\bsell\b.{0,25}\bproduct\b/i,
    title:"Recording a sale",route:ROUTES.sales,
    summary:"Clementia supports local sales after it verifies the product, quantity, customer, payment and current stock.",
    steps:["Say “Record a sale”.","Give the item, quantity, customer and payment method.","Check the calculated total and choose Confirm sale; the sale remains unsaved until then."],
    inChat:"Record a sale"},
  {id:"receipt",match:/\b(?:issue|print|generate|give|send|make|provide)\b.{0,35}\breceipt\b/i,
    title:"Issuing a receipt",route:ROUTES.sales,
    summary:"A successfully confirmed sale creates a receipt record. Clementia does not independently send or print a receipt.",
    steps:["Ask Clementia to record a sale with the correct payment details.","Confirm the sale preview.","Review or share the resulting receipt through Sales, using the available page controls."],
    inChat:"Record a sale"},
  {id:"report",match:/\b(?:view|generate|show|see|read|make|find|open)\b.{0,35}\breport\b|\bsales?\s+report\b/i,
    title:"Viewing reports",route:ROUTES.reports,
    summary:"Clementia can read several local sales periods directly in chat. The full report interface remains a separate page.",
    steps:["Ask “Show today's sales” or “Show sales for this month”.","Clementia reads the saved local company figures.","Use Reports for more filters and detailed records."],
    inChat:"Show today's sales"},
  {id:"end-of-day",match:/\b(?:end.of.day|daily close|close.of.day|daily (?:review|summary))\b/i,
    title:"Reviewing the day",route:ROUTES.endOfDay,
    summary:"Clementia can prepare a read-only day review. Asking for the review does not lock or close a shift.",
    steps:["Ask “End-of-day summary”.","Review sales, payments and inventory findings.","If you need to close a staff shift, use the shift management flow."],
    inChat:"End-of-day summary"},
  {id:"supplier-purchases",match:/\b(?:supplier purchase|supplier|vendor|stock purchase|buy stock|purchase)\b/i,
    title:"Recording supplier stock",route:ROUTES.purchases,
    summary:"Clementia can prepare a stock receipt, but it cannot reconcile all supplier payables or issue payments.",
    steps:["Say “I received 10 eggs from Kofi Traders at 40 each”.","Answer any missing cost or supplier questions.","Confirm the stock receipt preview before inventory changes."],
    inChat:"Record a purchase"},
  {id:"expense",match:/\b(?:expense|expenses|rent|business spending|money spent)\b/i,
    title:"Recording an expense",route:ROUTES.expenses,
    summary:"Direct expense recording in Clementia is not implemented. A link to Expenses is not the same as completing this task.",
    steps:["Open Expenses.","Enter the real expense details using the expense form.","Review the saved expense there."]},
  {id:"health",match:/\b(?:business health|how (?:is|well) (?:my|the) business|attention points|business doing)\b/i,
    title:"Business health",route:ROUTES.health,
    summary:"Clementia can provide local evidence-based warnings. A low-warning result does not prove the books are complete.",
    steps:["Ask “What needs attention in my business?”","Review the reported exceptions and source details.","Verify important figures through the relevant records."],
    inChat:"What needs attention in my business?"},
  {id:"backup",match:/\b(?:backup|back up|restore|copy of (?:my|the) records|save a copy)\b/i,
    title:"Backing up and restoring data",route:ROUTES.backup,
    summary:"Clementia cannot silently export, upload, replace, or restore your business database.",
    steps:["Open the protected Backup section.","Export a backup using its owner-controlled controls.","For restoration, inspect the file and use the explicit restore confirmation on that page."]},
  {id:"assistant-help",match:/\b(?:use clementia|use (?:the )?assistant|ask tallybook|run my shop through chat|talk to the assistant)\b/i,
    title:"Using Clementia",route:ROUTES.assistant,
    summary:"Clementia can answer saved-record questions, prepare supported transactions with previews, and guide you to other Tallybook features.",
    steps:["Ask a concrete question such as “What is running low?”","For transactions, give the customer, product and payment details.","Clementia requests explicit confirmation before supported writes."],
    inChat:"help"},
];

const BOUNDARIES: readonly Guide[]=[
  {id:"staff-create",match:/\b(?:add|create|hire|register)\b.{0,30}\b(?:employee|staff|cashier|attendant)\b/i,title:"Adding staff",route:ROUTES.staff,summary:"Clementia cannot provision staff or grant permissions through chat.",steps:["Open Staff.","Use the protected staff management controls.","Verify the person's assigned role and stores."]},
  {id:"staff-shift",match:/\b(?:close|end|finish)\b.{0,25}\b(?:staff|cashier|employee|register)\s*shift\b|\bclose (?:today'?s|the|my)?\s*shift\b/i,title:"Closing a staff shift",route:ROUTES.staff,summary:"An end-of-day summary is not a shift closure. Clementia cannot finalize shift cash or balances.",steps:["Use the staff shift workflow.","Reconcile the drawer and payment totals.","Confirm the shift close in the permissioned UI."]},
  {id:"stock-transfer",match:/\btransfer\b.{0,40}\b(?:stock|eggs|rice|items?|store|shop|warehouse)\b/i,title:"Transferring stock",route:ROUTES.stores,summary:"Clementia cannot dispatch or receive inter-store transfers from chat.",steps:["Open Stores or Stock transfers.","Select the source and destination stores and products.","Dispatch and receive using their verified stock workflows."]},
  {id:"tax",match:/\b(?:set|configure|change|update)\b.{0,25}\b(?:tax|vat)\b/i,title:"Configuring taxes",route:ROUTES.business,summary:"Clementia cannot change tax-policy settings from chat.",steps:["Open Business settings.","Inspect the business's applicable tax policy.","Review any tax consequences and save through the protected settings workflow."]},
  {id:"password",match:/\b(?:reset|change|recover)\b.{0,25}\bpassword\b/i,title:"Recovering a password",route:ROUTES.reset,summary:"For account security, Clementia never accepts or changes passwords inside chat.",steps:["Open the secure password-recovery screen.","Use your account provider's recovery instructions.","Sign in after your provider confirms recovery."]},
  {id:"sign-in",match:/\b(?:sign\s?in|log\s?in|login)\b.{0,35}\b(?:account|tallybook|shop)\b|^\s*(?:sign\s?in|log\s?in)\b/i,title:"Signing in",route:ROUTES.signin,summary:"Clementia cannot bypass authentication or accept a password inside its chat window.",steps:["Open Sign in.","Use the verified account sign-in screen.","Return to Clementia after your account session is confirmed."]},
  {id:"backup-export",match:/\b(?:export|download|save|make|create)\b.{0,25}\b(?:backup|copy of records|data backup)\b/i,title:"Exporting a backup",route:ROUTES.backup,summary:"Clementia cannot export a trusted backup by itself.",steps:["Open Backup.","Create and save a protected backup file.","Verify the file and preserve it outside the device."]},
  {id:"backup-restore",match:/\b(?:restore|import|recover)\b.{0,25}\b(?:backup|database|saved data|records)\b/i,title:"Restoring data",route:ROUTES.backup,summary:"Clementia cannot overwrite current data from chat; restoration requires explicit verification and approval.",steps:["Open Backup.","Check the selected backup and destination company.","Review and approve the restore operation there."]},
  {id:"business-create",match:/\b(?:create|set up|register)\b.{0,20}\b(?:business profile|my business)\b/i,title:"Creating a business",route:ROUTES.business,summary:"If this is the first local company, Clementia offers conversational onboarding; adding another company requires the authorized business workflow.",steps:["Use Clementia's first-business setup if no company exists.","For additional companies, open Business settings.","Confirm the business's details and access rights."]},
  {id:"receipt-send",match:/\b(?:send|share|email|whatsapp)\b.{0,35}\breceipt\b/i,title:"Sending a receipt",route:ROUTES.sales,summary:"Clementia cannot transmit a receipt to a phone, WhatsApp account or email recipient.",steps:["Open the recorded sale receipt.","Verify the correct customer and transaction.","Use an available secure share or print flow outside chat."]},
  {id:"reports-export",match:/\b(?:export|email|send|download)\b.{0,35}\b(?:report|pdf|spreadsheet|statement)\b/i,title:"Exporting reports",route:ROUTES.reports,summary:"Clementia can answer report questions, but does not export or email the report directly.",steps:["Open Reports.","Apply the appropriate filters.","Use any available export controls or create the report externally."]},
  {id:"commerce-publish",match:/\b(?:publish|make public|put online)\b.{0,35}\b(?:catalog|catalogue|products|storefront)\b/i,title:"Publishing a catalogue",route:ROUTES.commerce,summary:"Clementia cannot publish products or make your business public without an authorized storefront workflow.",steps:["Open Commerce.","Review which products and prices are approved for display.","Publish only after the business owner authorizes the storefront."]},
  {id:"commerce-orders",match:/\b(?:fulfill|fulfil|dispatch|ship|deliver)\b.{0,35}\b(?:online\s+)?orders?\b/i,title:"Fulfilling an order",route:ROUTES.commerce,summary:"Clementia cannot approve fulfillment or allocate stock for online orders through chat.",steps:["Open Commerce.","Verify the order, payment status and available stock.","Complete fulfillment through the authorized workflow."]},
  {id:"charge-payment",match:/\b(?:collect|charge|take|process)\b.{0,40}\b(?:real\s+)?(?:mobile money|momo|card|payment)\b/i,title:"Collecting a real payment",route:ROUTES.sales,summary:"Clementia cannot initiate an external MoMo or card charge. A recorded payment is not proof of actual settlement.",steps:["Use an authorized, configured payment provider.","Verify the provider's actual settlement.","Record the verified payment in Tallybook."]},
  {id:"supplier-payable",match:/\b(?:what|how)\b.{0,30}\b(?:owe|payable)\b.{0,25}\b(?:supplier|vendor|traders)\b/i,title:"Supplier balances",route:ROUTES.purchases,summary:"The local assistant cannot provide a verified supplier payable balance.",steps:["Open Purchases.","Reconcile invoices, payments and outstanding payable records.","Use the company's approved payable reporting workflow."]},
  {id:"edit-record",match:/\b(?:change|edit|delete|remove|update)\b.{0,50}\b(?:customer|sale|product|price|phone|stock|record)\b/i,title:"Editing existing records",route:ROUTES.business,summary:"Clementia does not directly edit or delete established financial, customer or stock records.",steps:["Open the page that owns the record.","Check permissions and existing dependencies.","Use the protected correction or archive workflow instead of silent mutation."]},
  {id:"refund",match:/\b(?:refund|return)\b.{0,35}\b(?:sale|customer|item|money|order)\b/i,title:"Refunds and returns",route:ROUTES.sales,summary:"Clementia cannot process an arbitrary refund. The business's enabled refund policy governs all returns.",steps:["Open the original sale.","Check your company-specific return policy.","Use the authorized refund flow and verify the linked financial adjustments."]},
  {id:"discount",match:/\b(?:apply|add|give|set|offer|change)\b.{0,30}\bdiscount\b/i,title:"Discounts",route:ROUTES.sales,summary:"Clementia cannot override stored sale prices or apply manual discounts in chat.",steps:["Open Sales.","Enter a discount only if your company's policy and staff role permit it.","Review the final amount before recording the sale."]},
  {id:"expense-direct",match:/\b(?:record|log|enter|save|create)\b.{0,50}\b(?:expense|rent|spending)\b/i,title:"Expenses",route:ROUTES.expenses,summary:"Clementia currently does not save expenses in chat.",steps:["Open Expenses.","Enter a category, amount, date and description as required.","Confirm the recorded expense on that page."]},
];
const ASK_HOW = /^(?:how (?:do|can|should|would|to)\b|what (?:steps|is the easiest way)\b|where can i\b|which screen\b|is there a way\b|please explain\b|explain (?:the process|how)\b|teach me\b|show me how\b|can you (?:show|tell|explain|walk)\b|could you (?:show|guide|explain|walk)\b|i (?:do not|don't) know how\b|as a beginner\b|tell me how\b|help me learn\b)/i;
const DIRECT_BOUNDARY = /^(?:edit|delete|remove|change|update|refund|apply|give|offer|transfer|add (?:staff|employee|cashier|attendant)|create (?:business profile|my business)|close (?:the |today'?s |my )?(?:staff|cashier|shift)|sign\s?in|log\s?in|reset|restore|export|email|send|publish|fulfill|fulfil|set|charge|collect|record (?:a |an |the )?(?:expense|rent))\b/i;

function guideResponse(guide:Guide,askedHow:boolean,prepared:string):AssistantReply {
  const canDo=Boolean(guide.inChat);
  const route=guide.id==="edit-record"
    ? /\b(?:customer|phone|client)\b/i.test(prepared)?ROUTES.customers
      : /\b(?:product|stock|price|inventory)\b/i.test(prepared)?ROUTES.stock
      : /\b(?:sale|receipt)\b/i.test(prepared)?ROUTES.sales
      : ROUTES.business
    : guide.route;
  return {
    kind:askedHow?"answer":"unsupported",
    text:canDo
      ? `${guide.title}: ${guide.summary}`
      : `${guide.title}: ${guide.summary} I cannot complete this operation entirely from this chat today.`,
    details:guide.steps.map((value,index)=>({label:`Step ${index+1}`,value})),
    link:{label:`Open ${guide.title}`,href:route},
    actions:guide.inChat?[{type:"say",label:"Try with Clementia",text:guide.inChat}]:undefined,
  };
}

/** Returns null when this should be handled by the normal read/transaction parser. */
export function soleInterfaceGuide(raw:string):AssistantReply|null {
  const prepared=prepareText(raw);
  if(!prepared)return null;
  const askedHow=ASK_HOW.test(prepared);
  if(askedHow){
    const guide=BOUNDARIES.find(item=>item.match.test(prepared))??FAQ_GUIDES.find(item=>item.match.test(prepared));
    return guide?guideResponse(guide,true,prepared):null;
  }
  if(!DIRECT_BOUNDARY.test(prepared))return null;
  const matched=BOUNDARIES.find(item=>item.match.test(prepared));
  return matched?guideResponse(matched,false,prepared):null;
}
