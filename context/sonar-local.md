# Local SonarQube

The founder selected a **local-only** Community Build instance in [AR-9](https://linear.app/aaryan-das/issue/AR-9). Open [Applied Research (local)](http://127.0.0.1:9000/dashboard?id=applied-research-local). Docker Desktop must be running.

## Verified analysis

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
