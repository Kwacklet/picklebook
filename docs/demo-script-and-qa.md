# PickleBook – Demo Script and Q&A Prep

## Before your time slot (about 15 minutes early)

1. Start Docker Desktop. Check that Jenkins is running at http://localhost:8081 (`docker ps`).
2. Make sure the latest build is green and http://localhost:8080 works. Note the build number (call it **N**).
3. Create 2–3 reservations and confirm one. These are your "persistence" proof records.
4. Open these tabs in order:
   - the app
   - the Jenkins job page (Stage View)
   - VS Code with `frontend/public/index.html` and `reservations-api/src/rules.js`
   - PowerShell in the repo folder
5. Keep the backup video ready in case the internet fails.

## The 7 required demo steps (about 7 minutes)

| # | What to show | Commands / actions | Say |
|---|---|---|---|
| 1 | Running system | `docker compose ps` → all services **healthy**. In the browser, the badge shows **Build N** | "6 containers. Only the proxy publishes a port. The database is on an internal network." |
| 2 | Code change | In `frontend/public/index.html`, change the `<h1>` (for example to "PickleBook – Now open until 11 PM!"). Then:<br>`git commit -am "Update heading"`<br>`git push` | "We only push. Nobody touches Jenkins." |
| 3 | Automatic pipeline | Jenkins tab: build **N+1** starts by itself within about 1 minute. Walk through Checkout → Test → Build Images → Deploy → Smoke Test | Explain each stage in one sentence (see the README pipeline table). |
| 4 | Change is live | Refresh (Ctrl+F5): new heading and **Build N+1** | "The image was tagged N+1 and the smoke test confirmed that exact build is live." |
| 5 | Quality gate | In `reservations-api/src/rules.js` set `PEAK_MULTIPLIER = 1.5`. Then:<br>`git commit -am "Change peak price"` and `git push`<br>Build **N+2** fails at **Test** (3 tests fail). Refresh the site: still **Build N+1**.<br>Then `git revert HEAD --no-edit` and `git push`. Build **N+3** passes | "Broken code never reaches the running system. The failing test stopped the pipeline before Deploy." |
| 6 | Persistence | Your earlier reservations are still listed after all these redeploys. For a stronger proof, delete and recreate the DB container:<br>`docker compose rm -sf db`<br>`$env:TAG="N+3"; docker compose up -d --no-build` (use the real number)<br>Refresh: data is still there | "Containers are disposable. The data lives in the named volume pg-data." |
| 7 | Rollback | Jenkins → `picklebook-rollback` → Build with Parameters → `ROLLBACK_TAG = N`. Refresh: badge shows **Build N** and the old heading | "Every build's images stay on the machine, tagged with the build number, so rollback is one command and needs no rebuild." |

Finally, show `docker images picklebook/frontend` to list all the tagged versions.

## Suggested speaking split (10 minutes total)

| Member | Part |
|---|---|
| De Guzman (Project Lead) | Intro, problem, team roles, then runs the demo flow |
| Fajardo (Infrastructure) | Architecture diagram, Dockerfiles, compose, networks, volumes |
| Imperial (Backend & DB) | APIs, business rules, DB schema, tests |
| Corpuz (DevOps) | Jenkins setup, Jenkinsfile, trigger, credentials, rollback |
| Verona (Frontend/QA/Docs) | Frontend and build label, smoke test, docs, lessons learned |

## Likely Q&A questions (everyone should know all of these)

**Container vs virtual machine?**
A VM runs a whole guest operating system on a hypervisor. A container shares the host's kernel and only packages the app and its libraries. That makes containers start in seconds and use far less memory.

**Image vs container?**
An image is the read-only template, built from a Dockerfile. A container is a running instance of an image. We run one container per image.

**Why multi-stage Dockerfiles?**
The `test` stage has Jest and runs the tests. The `production` stage starts fresh and installs only production dependencies. The final image is smaller and contains no test tools. Jenkins runs `--target test`, so it does not need Node installed.

**Why copy `package.json` before the source code?**
Layer caching. `npm ci` is only re-run when dependencies change, not on every code change.

**How does data survive redeploys?**
PostgreSQL writes to the named volume `pg-data`. Deploys replace containers but never remove volumes (we never use `down -v`).

**Why can't the browser reach the database?**
The db publishes no ports. It is only on `backend-net`, which is `internal: true`. Only the two APIs are attached to it.

**What does `depends_on: condition: service_healthy` do?**
Compose waits until the db health check (`pg_isready`) passes before starting the APIs, and waits for the APIs' `/health` before starting the proxy.

**How does Jenkins know you pushed?**
Poll SCM. Every minute Jenkins asks GitHub whether `main` has a new commit, and it builds only if it does. A webhook is faster but needs a public URL (ngrok), because Jenkins runs on a laptop.

**How does a failing test stop deployment?**
`npm test` exits with a non-zero code, so `docker build --target test` fails. Jenkins marks the Test stage failed and skips all later stages, so Deploy never runs.

**How does rollback work?**
Every image is tagged with the Jenkins build number. Setting `TAG=<old number>` and running `docker compose up -d --no-build` switches the containers back to the old images. The database is not changed.

**Where are the passwords?**
They are in `.env`, which is git-ignored. Jenkins stores the real `.env` as a Secret file credential (`picklebook-env`). It is copied in only during Deploy and deleted in `post { cleanup }`. Only `.env.example` with placeholders is in Git.

**Why is Jenkins in a separate compose file?**
So the app pipeline can never restart or remove Jenkins while Jenkins is running the pipeline.

**Is mounting `docker.sock` safe?**
Not for production. It gives Jenkins root-level control of the host's Docker. Safer options are separate build agents, rootless Docker, DinD with TLS, or Kaniko.

**Why does the proxy use `resolver 127.0.0.11` and variables?**
When Jenkins recreates the API containers they get new IP addresses. With Docker's internal DNS resolver, nginx looks up the new IPs instead of caching the old ones.

**What happens if the new version deploys but is broken?**
The smoke test fails. The pipeline automatically redeploys the last successful build, then marks the build as failed.

**How is double booking prevented?**
Before inserting, reservations-api loads that court's pending and confirmed bookings for the date. It rejects the request with HTTP 409 if the time ranges overlap (`startA < endB && startB < endA`).
