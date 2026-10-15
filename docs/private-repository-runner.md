# Private Nightjar / self-hosted CI — safe rollout

**Status:** staged; this document alone does not switch runner assignments or change GitHub repository visibility.

## Why this is necessary

- Nightjar runs on Firebase Hosting, Firebase Authentication, Cloud Functions, Firestore and Storage. None of those services depend on your personal computer staying online.
- Private GitHub repositories can consume limited hosted-runner minutes; GitHub does not currently charge self-hosted *compute* minutes. GitHub artifact/cache storage, Firebase usage, electricity and other infrastructure are separate costs.
- The existing workflows use GitHub-hosted `ubuntu-latest` and `ubuntu-24.04`, including build, validation, PR previews and production deployments.
- Moving **only CI checks** onto a local runner reduces hosted minutes. Production deployment remains on GitHub-hosted runners initially so Google/Firebase credentials are not exposed to a personal machine.
- GitHub App access and GitHub Actions billing are distinct. The ChatGPT GitHub installation currently selects all repositories, and private Tiny Titans access can be tested independently. If Nightjar becomes inaccessible, review the GitHub App installation rather than publishing code to work around it.

## Initial setup on the PC (once)

**Use a dedicated, isolated Linux virtual machine**, ideally Ubuntu 24.04 (4 vCPUs, 8–12 GiB RAM, 30 GiB disk). Do not run an Actions worker directly with access to personal files or Windows sessions. Do not use a mounted Windows home directory or provide the VM with cloud credentials, SSH keys, passwords, or Firebase deploy tokens.

1. Open [Nightjar > Settings > Actions > Runners](https://github.com/Mort2307/NightJar-Audio/settings/actions/runners).
2. Select **New self-hosted runner** > **Linux** > **x64**.
3. Follow GitHub's current, generated download/checksum/config commands **inside the Linux VM**. Registration tokens are short-lived; do not post them in a chat, issue, PR or commit. Choose a distinctive name such as `nightjar-ci-vm`.
4. When configuring labels, ensure the runner has `self-hosted`, `linux`, `x64` and add the custom label **`nightjar-ci`**. Keep it scoped to this repository.
5. Run the runner under a dedicated unprivileged VM user, not root. Configure GitHub's documented service only after verifying operation interactively.
6. Keep the VM isolated, patch it regularly, restrict who can modify workflows or PR branches, and never grant workflows host file shares or production secrets.
7. With a runner showing **Idle**, merge the readiness-only workflow and manually start **Actions > Nightjar self-hosted runner readiness > Run workflow**. The workflow performs the project's current checks and a Functions typecheck, but **does not deploy**. A job queued without a runner is not a failure.

## Then migrate safely — not before readiness passes

- Move **unprivileged** frontend build, validation and advisory PR checks to `runs-on: [self-hosted, linux, x64, nightjar-ci]`.
- Prevent externally forked PRs from using self-hosted runners, and prohibit arbitrary external contributors from running code there.
- Keep `firebase-backend-deploy.yml` and `firebase-hosting-merge.yml` on hosted runners (their production identities/permissions must not run inside the CI VM). Hosted minutes will therefore **not** become literally zero.
- GitHub-hosted PR Hosting previews also consume minutes; decide separately whether they should remain automatic or become on-demand. Do not remove testing or deployment guardrails in pursuit of zero cost.
- Run a full real PR with frontend/build/backend validation, then a controlled merge and Firebase Hosting deployment, before switching the repository visibility.
- Confirm ChatGPT/GitHub connectivity **after** the repository becomes private. If access disappears, inspect [GitHub App installations](https://github.com/settings/installations) and reconnect/re-authorise the relevant integration; do not make the source public again solely to debug access.
- APK packaging/signing is a separate follow-up after CI has stabilised. Keep Android signing keys in a protected signing environment, **never** on the general-purpose PR runner.

## Important security boundaries

A self-hosted runner executes workflow code, including build scripts from PR branches. GitHub warns that it does not provide the same disposable VM isolation as GitHub-hosted runners. The VM is deliberately treated as potentially compromised; it should hold no valuable data, secrets or persistent production access.

If the PC is off, affected CI checks wait in GitHub until the runner reconnects. The live Firebase application and already deployed updates remain available. The PC must be on for builds that use its runner.

**No production deployment or visibility changes are performed by this rollout document.**
