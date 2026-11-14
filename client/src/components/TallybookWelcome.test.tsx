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
