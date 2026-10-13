# Staging proposal — awaiting owner approval

No external host has been provisioned, contacted for deployment, or authorized. Production deployment is prohibited by the owner's instruction. This is a proposal for a later approval, not permission to deploy.

Proposed environment name: **tallybook-staging**. Use one private Ubuntu 24.04 LTS virtual machine with a persistent POSIX filesystem, initially 2 vCPU, 4 GB RAM and 30 GB storage. These sizes are a starting estimate, not a measured capacity guarantee. Choose the hosting account, region, budget and hostname with the owner. Use synthetic companies only; no production backups or customer data. Limit inbound access to the owner's test network and assigned reviewers.

Ubuntu 24.04 is proposed because the server's file ownership and permission checks need POSIX behavior. Canonical lists standard security maintenance through May 2029 ([release lifecycle](https://ubuntu.com/about/release-cycle)). The tested local runtime is Node 24.19.0 and pnpm 10.34.0. Before provisioning, review and pin the current supported Node 24 security patch and rerun all checks; the [Node release repository](https://github.com/nodejs/node/releases) already lists newer patches than the tested local runtime. No claim that the local pin is the newest release is made.

Use a dedicated unprivileged service account. Bind the app to an unprivileged port and use **direct TLS** to Node, or layer-4 TLS passthrough. The current server deliberately rejects forwarded headers as proof of TLS; a conventional TLS-terminating HTTP proxy is not compatible with protected routes. TLS private keys, credential/session directories and backup storage must have restrictive owner permissions and persistent storage. Do not use ephemeral serverless disk or multiple replicas for the current file adapters.

Initial staging scope: serve the built PWA with all cloud mutation flags off; run the mock payment contract locally on the VM, without connecting it to sale/payment tables. No gateway is approved. Keep public storefront, reservations, financial replication, authoritative store transfers and fulfillment disabled. Never promote a successful mock event to a real payment.

Approval needed before execution: hosting account/environment and region, cost ceiling, hostname/TLS issuer, allowed tester network, service operator, and recovery storage location. Credentials must be supplied through the host's secret mechanism, not chat or source control. Provider selection and sandbox credentials are a separate later approval.

After approval, execute the commands and recovery steps in `OPERATIONS.md`. Record Linux permissions/TLS test logs, deployment artifact SHA-256, backup/restore timing, interruption behavior and rollback results. A successful deployment alone does not close the open product/accounting/security gates in `blockers.json`.
