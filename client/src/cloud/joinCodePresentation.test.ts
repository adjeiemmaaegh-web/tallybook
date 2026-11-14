import {expect,it} from "vitest";
import {joinCodeKind} from "./joinCodePresentation";
it("accepts readable 8-character codes without changing their submitted spelling",()=>{
 expect(joinCodeKind("k7qm-2xpd")).toBe("short");
 expect(joinCodeKind("ABCD2345")).toBe("short");
 expect(joinCodeKind("  ABCD-2345  ")).toBe("short");
});
it("accepts targeted versioned invitations but not a public personal identifier",()=>{
 expect(joinCodeKind("v1."+"A".repeat(43))).toBe("targeted");
 for(const value of ["","employee@example.com","user-id","ABC","abcd-2xpd-extra","v1.short",".."," ".repeat(40)]){
  expect(joinCodeKind(value)).toBeNull();
 }
});
