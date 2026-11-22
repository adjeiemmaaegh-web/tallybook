import {afterEach,describe,expect,it,vi} from "vitest";
import {render,screen,within,waitFor,cleanup,fireEvent} from "@testing-library/react";
import {PremiumHomeOverview} from "./PremiumHomeOverview";
import {currencies} from "@/features/business/currencies";
import {formatMinorAmount,currencyMinorDivisor} from "@/features/inventory/inventory";

// The display-only component receives genuinely shaped report results.
// The mock never writes sales, stock, customers, debt or financial records.
vi.mock("@/features/reports/reports",()=>({
  getDashboardSummary:vi.fn(async()=>({
    generatedAt:"2026-11-07T12:00:00.000Z",
    todaySalesMinor:12500,
    todayMoneyReceivedMinor:10000,
    outstandingDebtMinor:2500,
    todayTransactions:2,
    lowStockProducts:[],
    recentSales:[],
    recentActivity:[],
    trend:[
      {dateKey:"2026-11-01",label:"Sun",salesMinor:0},
      {dateKey:"2026-11-02",label:"Mon",salesMinor:0},
      {dateKey:"2026-11-03",label:"Tue",salesMinor:0},
      {dateKey:"2026-11-04",label:"Wed",salesMinor:0},
      {dateKey:"2026-11-05",label:"Thu",salesMinor:0},
      {dateKey:"2026-11-06",label:"Fri",salesMinor:0},
      {dateKey:"2026-11-07",label:"Sat",salesMinor:12500}
    ]
  })),
  getBusinessHealthSummary:vi.fn(async()=>({expensesMinor:400}))
}));
vi.mock("@/features/business/setupProgress",()=>({
  hasReportsExplored:()=>false
}));

afterEach(cleanup);

describe("Screenshot-aligned REAL local dashboard",()=>{
  it("renders accurate till, receipts and customer debt from the report API",async()=>{
    render(<PremiumHomeOverview companyId="qa-company" companyName="Test Shop"
      country="Ghana" currency="GHS" online={false}
      counts={{products:4,customers:2,sales:2}}/>);
    const till=screen.getByRole("region",{name:"Today at the till"});
    await waitFor(()=>expect(till.querySelector(".tb-dashboard-till-total")?.textContent).toBe(formatMinorAmount(12500,"GHS")));
    expect(within(till).getByText(/2 recorded sales/)).toBeInTheDocument();
    expect(within(till).getByText(/Collected/)).toBeInTheDocument();
    expect(till.querySelector(".tb-dashboard-till-cells > div:nth-child(2) strong")?.textContent).toBe(formatMinorAmount(2500,"GHS"));
    expect(screen.getByText("Customer receivables")).toBeInTheDocument();
    expect(screen.getByRole("heading",{name:"Good to see you"})).toBeInTheDocument();
    expect(screen.getByText(/Test Shop/)).toBeInTheDocument();
    expect(screen.getByText(/Offline — records saved on this device/)).toBeInTheDocument();
  });

  it("retains working POS, inventory, reports and setup navigation",()=>{
    render(<PremiumHomeOverview companyId="qa-company" companyName="Test Shop"
      country="Ghana" currency="GHS" online
      counts={{products:4,customers:2,sales:2}}/>);
    const urls=Array.from(document.querySelectorAll(".tb-dashboard-shortcuts a"))
      .map(a=>a.getAttribute("href"));
    expect(urls).toEqual(["/sales","/reports","/inventory"]);
    expect(document.querySelectorAll(".premium-action")).toHaveLength(5);
    expect(document.querySelectorAll(".premium-step")).toHaveLength(5);
    expect(document.querySelector(".premium-setup")?.getAttribute("id")).toBe("getting-started");
  });
});

it.each(currencies)('chart axes and accessible data values preserve %s ledger units',async(currency)=>{
 const view=render(<PremiumHomeOverview companyId="qa-company" companyName="Currency fixture" country="Ghana" currency={currency} online counts={{products:1,customers:0,sales:1}}/>);
 const chart=await screen.findByRole('img',{name:/Sales line chart/});
 const axis=chart.querySelectorAll('text');expect(axis).toHaveLength(5);
 expect(axis[4].textContent).toBe(Math.round(12500/currencyMinorDivisor(currency)).toLocaleString());
 expect(axis[4].getAttribute('aria-label')).toBe(formatMinorAmount(12500,currency));
 fireEvent.click(screen.getByText('View seven-day sales values'));
 expect(view.container.querySelector('details')).toHaveAttribute('open');
 const table=screen.getByRole('table',{name:`Recorded sales by date (${currency})`});
 expect(within(table).getAllByRole('row')).toHaveLength(8);
 expect(within(table).getAllByRole('cell').at(-1)?.textContent).toBe(formatMinorAmount(12500,currency));
});
