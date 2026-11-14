import {describe,expect,it} from "vitest";
import {soleInterfaceGuide} from "./soleInterfaceGuides";
import {parseApplicationRequest} from "./appKnowledge";

describe("Clementia FAQ versus navigation boundaries",()=>{
  it.each([
    ["where can I find suplier","purchases"],
    ["Where can I find customers?","customers"],
    ["Where is the stock page?","stock"],
    ["Open Purchases","purchases"],
    ["Please open backup","backup"],
    ["Take me to Sales","sales"],
  ])("routes %s through navigation instead of a generic guide",(phrase,id)=>{
    expect(soleInterfaceGuide(phrase)).toBeNull();
    expect(parseApplicationRequest(phrase)?.capability.id).toBe(id);
  });
  it("continues to explain how to create a supplier, without changing records",()=>{
    const guide=soleInterfaceGuide("How do I add supplier Accra Wholesalers?");
    expect(guide?.kind).toBe("answer");
    expect(guide?.link?.href).toBe("/purchases");
    expect(guide?.actions?.some(a=>a.type==="say")).toBe(true);
  });
  it("does not turn sensitive record modifications into executable chat operations",()=>{
    const guide=soleInterfaceGuide("Delete customer Adwoa");
    expect(guide?.kind).toBe("unsupported");
    expect(guide?.link?.href).toBe("/customers");
  });
});
