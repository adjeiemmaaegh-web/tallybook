/** Stage 29: public hero and CTA paths must not rely on invented commerce pages. */
import {render,screen} from "@testing-library/react";
import {expect,it} from "vitest";
import {TallybookWelcome} from "./TallybookWelcome";

it("opens an existing sign-in route from the shared-shop hero",()=>{
 render(<TallybookWelcome variant="shop"/>);
 expect(screen.getByRole("heading",{level:1})).toHaveTextContent(/Your business/);
 expect(screen.getByRole("link",{name:/Create your account/i})).toHaveAttribute("href","/signin");
 expect(screen.getByRole("link",{name:/I already have an account/i})).toHaveAttribute("href","/signin");
 expect(screen.getByRole("navigation",{name:"Page sections"})).toBeInTheDocument();
});

it("routes the private-device setup separately and explains its offline scope",()=>{
 render(<TallybookWelcome variant="device"/>);
 expect(screen.getByRole("link",{name:/Set up this device/i})).toHaveAttribute("href","/business");
 expect(screen.getByRole("link",{name:/Use a shared shop/i})).toHaveAttribute("href","/shop");
 expect(screen.getByText(/Local records stay in this browser and are not automatically uploaded/)).toBeInTheDocument();
});

it("presents three real operational pillars with functional public navigation",()=>{
 render(<TallybookWelcome variant="shop"/>);
 const menu=screen.getByRole("navigation",{name:"Page sections"});
 expect(menu.querySelector('a[href="#pillars"]')).toHaveTextContent("Three pillars");
 const section=document.getElementById("pillars")!;
 expect(section).toBeInTheDocument();
 expect(section.querySelectorAll(".tbl-pillar")).toHaveLength(3);
 expect(screen.getByRole("heading",{name:"Sales & receipts"})).toBeInTheDocument();
 expect(screen.getByRole("heading",{name:"Stock & purchasing"})).toBeInTheDocument();
 expect(screen.getByRole("heading",{name:"Owners & their teams"})).toBeInTheDocument();
 expect(screen.getByRole("link",{name:/Explore your shop account/})).toHaveAttribute("href","/signin");
 expect(screen.getByText(/Device records are not automatically uploaded or merged/)).toBeInTheDocument();
});
it("does not pretend that email grants staff access or that the shared shop has universal offline sync",()=>{
 render(<TallybookWelcome variant="shop"/>);
 expect(screen.getByText(/An email address or employee number alone cannot grant access/)).toBeInTheDocument();
 expect(screen.getByText("Shared shop uses the cloud")).toBeInTheDocument();
 expect(screen.queryByText("Sync never blocks the till")).toBeNull();
 expect(screen.queryByRole("link",{name:/app store|subscribe|buy now/i})).toBeNull();
});
