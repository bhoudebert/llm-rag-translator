# What only the owner can do on GitHub

The skill writes files. These settings are the owner's to change: list them, give the commands, and run one only when the user
says to. `gh` must be logged in with enough scope. Replace `OWNER/REPO`.

## 1. Branch protection on the default branch

Required status checks (use the names that appear in the Checks tab; they are the job names):

- `Quality gate` (the aggregate job of `ci.yml`: it waits for every component job)
- `conventional-title` (the PR title check)
- with `spec_driven`: `Specs validate` and `Spec or docs with code`

Also: require a pull request, linear history, no force pushes, no deletions, require branches to be up to date (strict). A
reasonable start needs no required reviews for a solo maintainer; add them when a team joins. "Include administrators" decides
whether the maintainer is bound by the checks too: on for a team, a choice for a solo project.

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["Quality gate", "conventional-title"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

A required check only works after it has reported once, so open a first pull request, let the workflows run, then require them.

## 2. Merge settings

Squash merge only, with the pull request title as the commit title (the title is what release-please reads). In the UI:
Settings, General, Pull Requests: allow squash merging with "Default to pull request title", disable merge commits and rebase
merging, enable "Automatically delete head branches".

```bash
gh api -X PATCH repos/OWNER/REPO -f allow_squash_merge=true -f allow_merge_commit=false -f allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY -f delete_branch_on_merge=true
```

## 3. Labels

With `spec_driven`: the `no-spec` label, set by a person to say a change has no behaviour change.

```bash
gh label create no-spec --description "No behaviour change: no spec update needed" --color d4c5f9 -R OWNER/REPO
```

## 4. Secrets

`RELEASE_PLEASE_TOKEN`: a personal access token (or GitHub App token) with `contents` and `pull-requests` write. Without it,
release pull requests are opened with the workflow's own token, which does not start other workflows, so the required checks
never run on them and an administrator has to merge. Never paste a token into a chat or a file in the repository.

## 0. What the plan allows

Some features depend on the repository being public, or on the account's plan, and the skill cannot see either. Ask before
turning them on, and say plainly when one is unavailable. As far as I know (check the current GitHub plans before promising
anything): code scanning (CodeQL) is free on public repositories and needs GitHub Code Security on private ones, which is sold
to organisations, not to personal accounts; branch protection and required status checks on a **private** repository need a paid
plan (Pro for a personal account, Team for an organisation); secret scanning and push protection on a private repository need
GitHub Secret Protection. Dependabot, Actions and release-please work on every plan. A private repository on a free personal
plan therefore cannot enforce the required `Quality gate`: the checks still run and report, but nothing blocks a merge.

## 5. Security features

Settings, Code security: enable Dependabot alerts and security updates, secret scanning and push protection. Code scanning: use
the generated `codeql.yml` (advanced setup); do not also enable "default setup", the two conflict.

## 6. Private vulnerability reporting

Settings, Code security, "Private vulnerability reporting": on. `SECURITY.md` and the issue-template config point to it.
