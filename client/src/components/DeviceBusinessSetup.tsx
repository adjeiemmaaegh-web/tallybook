import { Link } from "wouter";

export function DeviceBusinessSetup({ description }: { description: string }) {
  return <section className="tb-device-setup">
    <h1>Set up your business</h1>
    <p>{description}</p>
    <Link href="/business" className="primary-action">Enter business details</Link>
  </section>;
}
