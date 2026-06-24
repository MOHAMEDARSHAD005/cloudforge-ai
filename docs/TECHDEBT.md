# Technical Debt Log

This document tracks accepted technical debt, deferred security vulnerabilities, and deprecated architectural patterns in the CloudForge AI monorepo.

---

## TECHDEBT-001: Next.js 14 / PostCSS Security Advisories (Phase 0 Exception)

* **Status:** ⚠️ Active (Accepted Risk)
* **Date Identified:** June 2026
* **Target Remediation Phase:** Phase 1 (Core Agent Pipeline)

### Vulnerabilities Tracked

| CVE / Advisory ID | Severity | Component | Description |
| :--- | :--- | :--- | :--- |
| **GHSA-9g9p-9gw9-jx7f** | High | `next@14.2.35` | DoS in Image Optimizer remotePatterns config |
| **GHSA-h25m-26qc-wcjf** | High | `next@14.2.35` | HTTP request deserialization DoS via RSC |
| **GHSA-ggv3-7p47-pfv8** | High | `next@14.2.35` | HTTP request smuggling in rewrites |
| **GHSA-3x4c-7xq6-9pq8** | High | `next@14.2.35` | Unbounded image disk cache growth (storage exhaustion) |
| **GHSA-q4gf-8mx6-v5v3** | High | `next@14.2.35` | DoS with Server Components |
| **GHSA-8h8q-6873-q5fj** | High | `next@14.2.35` | DoS with Server Components |
| **GHSA-3g8h-86w9-wvmq** | High | `next@14.2.35` | Cache poisoning via Middleware redirects |
| **GHSA-ffhc-5mcf-pf4q** | High | `next@14.2.35` | XSS in App Router CSP nonces |
| **GHSA-vfv6-92ff-j949** | High | `next@14.2.35` | Cache poisoning in RSC cache-busting |
| **GHSA-gx5p-jg67-6x7h** | High | `next@14.2.35` | XSS in beforeInteractive scripts |
| **GHSA-h64f-5h5j-jqjh** | High | `next@14.2.35` | DoS in Image Optimization API |
| **GHSA-c4j6-fc7j-m34r** | High | `next@14.2.35` | SSRF in WebSocket upgrades |
| **GHSA-wfc6-r584-vfw7** | High | `next@14.2.35` | Cache poisoning in RSC responses |
| **GHSA-36qx-fr4f-26g5** | High | `next@14.2.35` | Middleware / Proxy bypass in Pages Router i18n |
| **GHSA-qx2v-qp2m-jg93** | Moderate | `postcss@<8.5.10` | XSS via Unescaped style tag in CSS Stringify |

### Business Justification for Deferring
Upgrading to a patched version of Next.js requires Next.js `15.5.18+` or `16.2.6+`, which both depend on React 19+. Upgrading the core React version in Phase 0 violates stability criteria and would require rewriting large parts of the frontend build configurations. 

Since the frontend is not public-facing during Phase 0, the exploitability vector is negligible.

### Remediation Path
Upgrade to Next.js `16.2.x` and React `19.2.x` early in Phase 1 when the development environment and pipeline baselines are fully established.
