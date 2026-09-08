# Local SonarQube

The founder selected a **local-only** Community Build instance in [AR-9](https://linear.app/aaryan-das/issue/AR-9). Open [Applied Research (local)](http://127.0.0.1:9000/dashboard?id=applied-research-local). A Docker-compatible container engine must keep the existing Sonar and PostgreSQL services running. OrbStack is now the active engine; the original pinned Compose configuration runs against its Docker context.

## Verified analysis

September 8 Opening integration repair: analysis `d4ba6ef4-a1a2-4bce-8575-c8983b6b3e22` at `2026-09-08T12:52:40Z` passed with 0 new violations, 98.9% new-code coverage and 0% new duplicated lines. The previous-version baseline remained `2026-09-08T02:56:19Z`. This scanned the dirty integration checkout; its exact source is preserved in the Opening repair handoff rather than attributed to root HEAD. The current native analyzer reports 26 unresolved existing findings, retained for AR-11 or the owning upcoming slice. Independent review remains a separate acceptance requirement.

The initial foundation receipt below predates these changes.

The final scan passed its quality gate after the initial baseline. Reported bugs, vulnerabilities and security hotspots: **0**; coverage **95.4%**; duplicated lines **0%**. Twenty maintainability findings remain, triaged in [AR-11](https://linear.app/aaryan-das/issue/AR-11). The three explicit-submit-type findings were fixed and verified by rescan. The gate evaluated new violations and duplication successfully; this does not certify overall product correctness.

## Daily use

```sh
npm run sonar:start
npm run sonar:logs
npm run sonar:scan
npm run sonar:stop
```

Wait for `SonarQube is operational` before scanning. `sonar:scan` regenerates combined test coverage and invokes the official scanner, waiting for the quality gate. A failed gate is an actionable result, not a reason to weaken thresholds. Stopping preserves named volumes; deleting volumes removes database contents and analysis history.

Sign in as `admin`. The generated password is stored under `SONAR_ADMIN_PASSWORD` in local `.env.sonar`. This file is ignored by Git and owner-readable only (mode 0600). It also holds the database password and a project-scoped analysis token, expiring **2026-12-06**. Never paste its contents into a ticket or commit it. Rotate the token in Sonar's account security page, then replace `SONAR_TOKEN` locally before expiration.

## Installed configuration

`compose.sonar.yml` pins image digests for Community Build **26.9.0.129388**, PostgreSQL 17 Alpine and SonarScanner CLI **8.0.1.6346**. Sonar and PostgreSQL run natively on this Apple Silicon machine; the available scanner image is amd64 and runs through Docker's emulation. No application dependency was added for Sonar.

Only Sonar's HTTP port is published, at `127.0.0.1:9000`; PostgreSQL is reachable solely inside the Compose network. Volumes retain the database, analysis data, extensions and logs. No Elasticsearch bootstrap checks were disabled. This is a developer instance, not a public service or a backup guarantee.

The scanner receives read-only mounts for source, tests, coverage, TypeScript configuration and installed dependencies. It does not mount the credential file, design archives, personal annotations or vendored Effect reference. The token enters through the container environment; users with access to the Docker daemon can inspect container configuration.

Project key: `applied-research-local`. Local scans analyze the current working tree, including uncommitted changes, as one local baseline. SCM analysis is disabled for the isolated scanner mount. These results are not GitHub PR checks or evidence for a committed revision. Hosted GitHub Sonar remains disabled because hosted runners cannot reach localhost; the required GitHub CI gate is independent.

## Recreate on another development machine

1. Start Docker and use Node 24 with `npm ci`.
2. Create ignored `.env.sonar` with a strong random `SONAR_DATABASE_PASSWORD`; set permissions to 0600.
3. Run `npm run sonar:start`, open the dashboard, and immediately replace the initial `admin` password. Store the new password securely.
4. Create private project `applied-research-local`, generate a project-scoped analysis token and add it as `SONAR_TOKEN` in `.env.sonar`.
5. Run `npm run sonar:scan` and record actual findings and gate status in the work ticket.

Image upgrades are deliberate: review supported versions, back up the database, update digests, then verify startup and a real scan. Do not substitute floating tags in the committed configuration. Official references: [Docker installation](https://docs.sonarsource.com/sonarqube-community-build/server-installation/from-docker-image), [database requirements](https://docs.sonarsource.com/sonarqube-community-build/server-installation/installing-the-database).

## Native scanner recovery — September 8

Docker Desktop has intermittently stopped answering Docker API commands while the Sonar HTTP service remained healthy. The official `@sonar/scan@5.0.0` npm scanner was verified on Node 24/macOS arm64 with its provisioned JRE. It is temporary tooling, not an application dependency. This replaces only the scanner process; it uses the same server, project and gate.

After the required coverage run, supply `SONAR_TOKEN` from ignored local configuration through the process environment, `SONAR_HOST_URL=http://127.0.0.1:9000`, and a temporary `SONAR_USER_HOME`. Invoke:

```sh
npx --yes @sonar/scan@5.0.0 \
  -Dsonar.projectKey=applied-research-local \
  '-Dsonar.projectVersion=not provided' \
  -Dsonar.working.directory=/private/tmp/ar-sonar-native-analysis \
  -Dsonar.scm.disabled=true \
  -Dsonar.qualitygate.wait=true \
  -Dsonar.typescript.tsconfigPaths=tsconfig.node.json,tsconfig.web.json
```

The explicit project version preserves the existing baseline; the npm scanner otherwise derives a version from package.json. Do not print credentials or run concurrent scans. Freeze analyzed source until completion and record the API gate/issue/analysis receipt. The committed container scan command remains available when its engine responds. [Official npm scanner documentation](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/npm/using).

OrbStack supports the existing Docker CLI and Compose files. Its migration copies containers, images and volumes, so allow temporary disk headroom and verify Sonar history before reclaiming old Docker Desktop data. The September 8 migration copied the database/data volumes but failed to recreate digest-pinned containers with an invalid-reference error. Recreating those containers with the original Compose file restored the same server identity, all seven analyses, latest passing analysis d4ba6ef4-a1a2-4bce-8575-c8983b6b3e22 and unchanged baseline. A private pg_dump archive was restored successfully into a disposable PostgreSQL database and verified to contain the same seven analysis rows. A fresh post-migration analysis `10675a8b-a4b0-473b-b58f-c6d5572bfd87` at `2026-09-08T15:05:51Z` also passed with 0 new violations, 98.9% new coverage and 0% new duplication on the same reviewed source. Runtime evidence is in /private/tmp/ar-gauntlet-20260908/orbstack-restoration.json, orbstack-backup-verification.json and orbstack-first-scan.json. Old Docker Desktop named volumes remain available for recovery; redundant stopped containers and reproducible images were removed under the founder-authorized disk cleanup, then Docker Desktop was stopped. Disk headroom reached 9.3 GiB immediately after cleanup, before ongoing build allocations. OrbStack is running a trial; no subscription purchase has been performed. [Migration documentation](https://docs.orbstack.dev/install), [license pricing](https://orbstack.dev/pricing).
