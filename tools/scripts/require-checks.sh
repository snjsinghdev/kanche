#!/usr/bin/env bash
# Makes the CI jobs required checks on main (Phase 0 prompt, item 8).
#
# GitHub refuses branch protection on private repositories on the Free plan (HTTP 403,
# "Upgrade to GitHub Pro or make this repository public"). Run this once the repository is public
# or the account is on Pro (ADR-0001, docs/handoff/phase-00.md).
set -euo pipefail

repo="${1:-snjsinghdev/kanche}"

gh api --method PUT "repos/${repo}/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "verify" },
      { "context": "e2e (chromium)" },
      { "context": "e2e (webkit)" },
      { "context": "e2e (firefox)" },
      { "context": "determinism" },
      { "context": "android-debug" }
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
echo "Required checks set on ${repo}@main."
