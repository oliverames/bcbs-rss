# Worklog

## 2026-07-13 - Privacy history cleanup

**What changed**: Rewrote every public branch so old maintainer emails use the GitHub noreply address, removed former donation and social-profile links, removed AI co-author and session trailers, and stripped an opaque public URL parameter that triggered secret scanning. The dependency lock now uses Undici 7.28.0, which clears the current high-severity advisories. The published feed content did not change.

**Verification**: All six tests pass, `npm audit` reports zero vulnerabilities, Gitleaks reports no findings across the rewritten branches, and no branch contains the former email, profile, machine-path, or AI-attribution patterns. The main and Dependabot branches were force-pushed with leases. The redundant Dependabot pull request was closed because its update is already on `main`.

**Remaining privacy step**: GitHub still serves the previous commits when someone requests an old object by its exact hash, even though no branch or tag points to that history. GitHub's documented process requires Support to remove cached views and run server-side garbage collection. The current repository history and live Pages site are clean, but strict removal from GitHub storage is not complete until Support confirms that purge.

---
