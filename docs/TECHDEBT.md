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

---

## TECHDEBT-002: NestJS 11 Migration (Phase 0 Exception)

* **Status:** ⚠️ Active (Accepted Risk)
* **Date Identified:** June 2026
* **Target Remediation Phase:** Phase 1 (Core Agent Pipeline)

### Vulnerabilities Tracked

| CVE / Advisory ID | Severity | Component | Description |
| :--- | :--- | :--- | :--- |
| **GHSA-36xv-jgw5-4q75** | Moderate | `@nestjs/core@<=11.1.17` | Improper Neutralization of Special Elements in Output Used by a Downstream Component ('Injection') |
| **GHSA-5j98-mcp5-4vw2** | High | `glob@<=10.4.5` (via `@nestjs/cli`) | Command injection via -c/--cmd executes matches with shell:true |
| **GHSA-3v7f-55p6-f55p** | High | `picomatch@<=4.0.3` (via `@nestjs/cli`) | Method Injection in POSIX Character Classes causes incorrect Glob Matching |
| **GHSA-c2c7-rcm5-vvqj** | High | `picomatch@<=4.0.3` (via `@nestjs/cli`) | ReDoS vulnerability via extglob quantifiers |
| **GHSA-52f5-9888-hmc6** | High | `tmp@<=0.2.5` (via `@nestjs/cli` -> `inquirer`) | Arbitrary temporary file / directory write via symbolic link `dir` parameter |
| **GHSA-ph9p-34f9-6g65** | High | `tmp@<=0.2.5` (via `@nestjs/cli` -> `inquirer`) | Path Traversal via unsanitized prefix/postfix enabling directory escape |
| **GHSA-8fgc-7cc6-rx7x** | High | `webpack@<=5.104.0` (via `@nestjs/cli`) | allowedUris allow-list bypass leading to build-time SSRF behavior |
| **GHSA-38r7-794h-5758** | High | `webpack@<=5.104.0` (via `@nestjs/cli`) | allowedUris bypass via HTTP redirects leading to SSRF |

### Business Justification for Deferring
Remediating these dependencies requires upgrading `@nestjs/cli`, `@nestjs/core`, `@nestjs/platform-express`, and `@nestjs/swagger` to NestJS v11. Upgrading NestJS major version in Phase 0 poses stability and architectural risks to the backend application, violating Phase 0 baseline rules. Since these are mostly dev dependencies or used only in internal API services, the security risk is minimal.

### Remediation Path
Upgrade to NestJS 11 and its matching dependencies during early Phase 1.

---

## TECHDEBT-003: Next.js 16 / React 19 Migration (Phase 0 Exception)

* **Status:** ⚠️ Active (Accepted Risk)
* **Date Identified:** June 2026
* **Target Remediation Phase:** Phase 1 (Core Agent Pipeline)

### Vulnerabilities Tracked
This entry tracks the complete framework migration to Next.js 16 and React 19, which resolves all vulnerabilities listed in `TECHDEBT-001`.

### Business Justification for Deferring
Upgrading from Next.js 14 to Next.js 16 requires a React 19 upgrade. This is deferred to Phase 1 to prevent breaking changes and compatibility issues with the development environment in Phase 0.

### Remediation Path
Perform the complete upgrade of Next.js and React early in Phase 1.
