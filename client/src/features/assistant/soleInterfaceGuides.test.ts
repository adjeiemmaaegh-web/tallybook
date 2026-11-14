import {describe,expect,it} from "vitest";
import {soleInterfaceGuide} from "./soleInterfaceGuides";

describe("Clementia explains features without pretending that a link completes work",()=>{
  it.each([
    ["How do I set up my business?","/business"],
    ["Can you show me how to add a new customer?","/customers"],
    ["What steps should I follow to add a new stock item?","/inventory"],
    ["How do I record a sale?","/sales"],
    ["Teach me to give a customer a receipt.","/sales"],
    ["How do I view a sales report?","/reports"],
    ["How do I review my end-of-day summary?","/end-of-day"],
    ["How do I record a supplier purchase?","/purchases"],
    ["How do I record a business expense?","/expenses"],
    ["How do I understand my business health?","/business-health"],
    ["How do I back up my records?","/backup"],
    ["How do I use Clementia to run my shop?","/assistant"],
    ["How do I add a supplier?","/purchases"],
    ["How do I add a category?","/inventory"],
    ["How do I prepare a quotation?","/quotations"],
    ["How do I find low stock?","/inventory"],
  ])("provides steps and a grounded route for %s", (prompt,route)=>{
    const reply=soleInterfaceGuide(prompt);
    expect(reply?.kind).toBe("answer");
    expect(reply?.link?.href).toBe(route);
    expect(reply?.details).toHaveLength(3);
    expect(reply?.text).not.toMatch(/couldn't identify/i);
  });
  it.each([
    ["Add staff member Joyce","/staff"],
    ["Close today's cashier shift","/staff"],
    ["Transfer 5 eggs from Store A to Store B","/stores"],
    ["Change Adwoa's phone to 0244009999","/customers"],
    ["Change Eggs price to 80","/inventory"],
    ["Edit the most recent sale","/sales"],
    ["Refund the last sale","/sales"],
    ["Sign in to my Tallybook account","/signin"],
    ["Reset my account password","/reset-password"],
    ["Export a full backup now","/backup"],
    ["Restore my backup file now","/backup"],
    ["Export my sales report to PDF","/reports"],
    ["Email my monthly sales report","/reports"],
    ["Send the last receipt via WhatsApp","/sales"],
    ["Publish my product catalog online","/commerce"],
    ["Fulfill the latest online customer order","/commerce"],
    ["Set a 15 percent tax rate","/business"],
    ["Collect 100 cedis by mobile money now","/sales"],
  ])("does not silently execute sensitive or unsupported request %s", (prompt,route)=>{
    const reply=soleInterfaceGuide(prompt);
    expect(reply?.kind).toBe("unsupported");
    expect(reply?.link?.href).toBe(route);
    expect(reply?.actions?.some(a=>a.type==="confirm")).not.toBe(true);
    expect(reply?.text).toMatch(/cannot|can't|not implemented|does not/i);
  });
  it.each([
    "Record a rent expense of 150 cedis",
    "How much does Adwoa owe?",
    "Show today's sales",
    "Sell 2 eggs to Kwame on credit",
    "Add customer Ama Serwaa",
    "Undo the last sale",
    "I received 10 eggs from Kofi Traders",
    "Prepare a quotation for Adwoa for 2 eggs",
    "I counted 25 eggs but we have 37",
  ])("does not intercept supported direct commands: %s",prompt=>{
    expect(soleInterfaceGuide(prompt)).toBeNull();
  });
});
