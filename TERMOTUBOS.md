# Termotubos WorkAdventure

This file is how the Termotubos team works on our fork of WorkAdventure. Keep it free of passwords, keys, tokens, and other secrets. Production secrets stay only on the servers.

## Repositories

| Name | GitHub | Git remote | What it is |
| --- | --- | --- | --- |
| Our fork | [OrgTermotubos/workadventure](https://github.com/OrgTermotubos/workadventure) | `origin` | Where we push branches and open pull requests |
| Upstream | [workadventure/workadventure](https://github.com/workadventure/workadventure) | `upstream` | The original project. We pull updates from here. We do not push to it. |

`master` tracks upstream. Do not put Termotubos work on `master`.

Our work lives on `termotubos-changes`. Open pull requests inside **OrgTermotubos/workadventure**, with `termotubos-changes` as the base branch.

## How to work with both repos

Clone the fork and add upstream once:

```bash
git clone https://github.com/OrgTermotubos/workadventure.git
cd workadventure
git remote add upstream https://github.com/workadventure/workadventure.git
git fetch upstream --tags
```

If `git remote -v` already lists `upstream`, skip `git remote add`.

Create `termotubos-changes` the first time, from an up-to-date `master`:

```bash
git checkout master
git pull origin master
git checkout -b termotubos-changes
git push -u origin termotubos-changes
```

For each change, start a short-lived branch from `termotubos-changes`, push it to `origin`, and open a pull request in our org:

```bash
git checkout termotubos-changes
git pull origin termotubos-changes
git checkout -b short-description
# edit, then commit
git push -u origin short-description
gh pr create --repo OrgTermotubos/workadventure --base termotubos-changes
```

Review happens in that pull request. Merge into `termotubos-changes`. Leave `master` for upstream updates only.

## How to pull in WorkAdventure updates

1. Fetch upstream, including release tags:

   ```bash
   git fetch upstream --tags
   ```

2. Update our `master` from `upstream/master`, then push it to `origin`. Merge is the default, because `master` is a shared branch:

   ```bash
   git checkout master
   git pull origin master
   git merge upstream/master
   git push origin master
   ```

   Rebase `master` onto `upstream/master` only when the team has agreed to rewrite that branch. After a rebase, the push needs a force-with-lease, which rewrites history other people may already have.

3. Replay our work on top of the updated `master`:

   ```bash
   git checkout termotubos-changes
   git pull origin termotubos-changes
   git rebase master
   ```

4. When the rebase finishes, update the remote branch:

   ```bash
   git push origin termotubos-changes
   ```

   If the branch was already on `origin` and the rebase rewrote it, use `git push --force-with-lease origin termotubos-changes`. Do not force-push `master`.

### Conflicts

During the rebase, Git stops on each conflicting commit. For every conflicted file:

1. Open the file and look at both sides. Read the matching row in [Our changes](#our-changes) before choosing what to keep.
2. Keep our change only where we still need it. Take the upstream version everywhere else.
3. Mark the file resolved and continue:

   ```bash
   git add path/to/file
   git rebase --continue
   ```

To abandon the attempt and return the branch to where it was:

```bash
git rebase --abort
```

After the rebase, read the diff against `master` (`git diff master...termotubos-changes`) and check that [Our changes](#our-changes) still matches what is on the branch. Update that section if a conflict changed one of our edits.

### What changed between versions

Production is pinned to the official **v1.34.5** images. To see upstream history since that release, or between two tags:

```bash
git fetch upstream --tags
git log --oneline v1.34.5..upstream/master
git diff --stat v1.34.5..<newer-tag>
```

Replace `<newer-tag>` with the release you are comparing. The `v1.34.5` tag is the release production runs today. The [upstream releases page](https://github.com/workadventure/workadventure/releases) is the list of tagged versions. A GitHub compare view (`workadventure/workadventure`, base tag to head tag) shows the same range in the browser.

The `VERSION` value on the server and the `docker-compose` file deployed there must belong to the same release. Upstream describes that rule in `contrib/docker/README.md`.

## How a change gets to production

Production is [https://workadventure.termotubos.com.br/](https://workadventure.termotubos.com.br/). It runs from the v1.34.5 production Compose file (`contrib/docker/docker-compose.prod.yaml`). Play is the local image `workadventure-play:termotubos-1`. The other WorkAdventure images are the official v1.34.5 release.

One Oracle Cloud machine, named WorkAdventure, in São Paulo (sa-vinhedo). It runs Ubuntu 24.04 on Ampere. WorkAdventure, LiveKit, and coturn all run on that machine. Traefik terminates HTTPS with Let's Encrypt. The login is in `~/.config/termotubos/workadventure/` (user `ubuntu`, address in `conn.txt`). Do not copy that key into this repo.

Maps and uploaded files go to the DigitalOcean Spaces bucket `tt-work-adventure-maps` in `nyc3`. Server config is `/opt/workadventure/.env` plus `docker-compose.override.yaml` on that machine. The override adds LiveKit, coturn, the LiveKit route in Traefik, and the Spaces settings for map storage. Do not copy those files into this repo. The official-image deploy replaces `docker-compose.yaml` and leaves the override in place. The override repeats the v1.34.5 Traefik command so it can also load the LiveKit route. When a later release changes Traefik's flags, update that command in the override during the same deploy.

Server work is done by the other assistant (New Bot) in the room chat.

A change reaches production in one of three ways.

### Config only

Use this when the running images already support the change. Edit `/opt/workadventure/.env` and, if the service layout must change, the Compose override on the app server. No image pull and no change in this fork.

Ask New Bot in the room chat to apply it. Say which variable or override changed and why. Do not paste secret values into chat or into this file.

Name the override `docker-compose.override.yml` (or `.yaml`) in `/opt/workadventure`. The official-image deploy merges that file and leaves it in place.

### Official image deploy

The back, uploader, and map-storage containers run the published `thecodingmachine/workadventure-*` images for the release tag in `VERSION`. The play container runs `workadventure-play:termotubos-1`, built on the Oracle machine from tag v1.34.5 plus the TermoAuth files. TermoAuth is on. Anonymous entry is off. LiveKit and coturn run on the same machine from the Compose override. An official-image deploy updates the three published images and leaves the play image and the override in place.

The same release tag supplies both the images and `contrib/docker/docker-compose.prod.yaml`. That file also pins Traefik, the icon server, and Redis. Read the [release notes](https://github.com/workadventure/workadventure/releases) first. A new variable still has to be added to `.env` by hand (config only, above) before or during the deploy.

`termotubos/deploy-official-image.sh` does the app-server steps. It needs `curl` or `wget` on that server. It downloads the Compose file, sets `VERSION` in `/opt/workadventure/.env` without printing the file, runs `docker compose pull`, then `docker compose up -d --force-recreate`. If the pull or the startup command fails, it puts back the previous Compose file and `VERSION`. After a successful run, open https://workadventure.termotubos.com.br/ and confirm the world loads.

Deploys stay off GitHub Actions. A job on a GitHub-hosted runner spends the org's included minutes, and this deploy does not need that.

Copy `termotubos/deploy-official-image.sh` onto the Oracle machine and run it there as root: `bash deploy-official-image.sh v1.34.5`.

`termotubos/deploy-official-image.sh --check v1.34.5` only confirms that upstream published a production Compose file for the tag. It does not touch the server.

### Custom build of this fork

The play image is built on the Oracle machine from the v1.34.5 tag plus the TermoAuth changes, and tagged `workadventure-play:termotubos-1`. The Compose override points the play service at that local image. A newer upstream release means rebasing those changes onto the new tag and building again on that machine. The image is not stored in a registry.

### Login

The running play image sends visitors to TermoAuth before they can enter. `TERMOAUTH_URL`, `TERMOAUTH_API_URL`, and `TERMOAUTH_APP_ID` are set in `/opt/workadventure/.env`, not in git. The app id is `workadventure`. `DISABLE_ANONYMOUS` is true.

The browser goes to TermoAuth `/handoff?app=workadventure` and comes back with `#token=`. The pusher checks that token against the TermoAuth signing keys. An email must be `@termotubos.com.br`. A master (`isMaster`) receives the in-world `admin` tag. Every other company account can enter and has no admin tag. An expired token (one hour) sends the browser back to the handoff. Logout goes to TermoAuth `/sign-out?app=workadventure`.

The running play image contains this login, and it is enabled. `termotubos/deploy-official-image.sh` still pulls the official back, uploader, and map-storage images. It does not replace the play image, because the Compose override pins that one.

## Keep changes small

Prefer a change that upstream will not overwrite.

- Put Termotubos behavior in a new file, a Compose override, or `.env` when that is enough.
- Edit an upstream file only when there is no separate place for the change.
- Keep each edit small, and keep unrelated edits in separate commits and pull requests.
- When you do change an upstream file, add a row to [Our changes](#our-changes) in the same pull request. The next rebase depends on that list.

## Our changes

Every source change we make belongs in this table, with the reason, so the next upstream rebase is a short checklist. Config that lives only on the server does not belong here.

| Date | Change | Why |
| --- | --- | --- |
| 2026-11-04 | Add `termotubos/deploy-official-image.sh`. Run it on the Oracle machine as root. | Production runs official images. A GitHub Actions deploy would spend the org's included minutes. |
| 2026-11-05 | TermoAuth handoff login. New files: `play/src/pusher/services/TermoAuthClient.ts`, `play/src/front/Connection/TermoAuthLogin.ts`, `play/src/common/TermoAuthUrls.ts`. Upstream files touched are listed below. `OpenIDClient.ts` and `LocalAdmin.ts` are unchanged. | TermoAuth returns a one-hour EdDSA JWT in `#token=`. The `admin` tag is applied in this fork when `isMaster` is true and the email is `@termotubos.com.br`, because TermoAuth does not send that tag. |

Upstream files touched for the TermoAuth login, for the next rebase:

- `play/src/pusher/controllers/AuthenticateController.ts` — `/login-screen` redirects to the handoff when the TermoAuth variables are set, `/logout` redirects to TermoAuth sign-out, `/anonymLogin` returns 403, and `POST /termoauth-session` exchanges the TermoAuth token for a WorkAdventure session.
- `play/src/front/Connection/ConnectionManager.ts` — reads `#token=` before the room URL is built, sends an expired session back to the handoff, and logout goes to TermoAuth sign-out.
- `play/src/pusher/services/JWTTokenManager.ts` — `createAuthToken` takes an optional expiration, so the session ends when the TermoAuth token ends.
- `play/src/pusher/enums/EnvironmentVariable.ts`, `play/src/pusher/enums/EnvironmentVariableValidator.ts`, `play/src/common/FrontConfigurationInterface.ts`, `play/src/front/Enum/EnvironmentVariable.ts` — `TERMOAUTH_URL`, `TERMOAUTH_API_URL`, and `TERMOAUTH_APP_ID`.
- `play/src/front/Phaser/Login/LoginScene.ts`, `play/src/front/Stores/MenuStore.ts`, `play/src/front/Components/ActionBar/MenuIcons/ProfileMenuContent.svelte`, `play/src/front/Phaser/Game/GameScene.ts` — login and logout stay available when TermoAuth is on.
- `play/tests/setup/vitest.setup.ts`, `play/tests/pusher/mocks/pusherEnvironmentVariableMock.ts` — the new front-config fields, left off in tests.
