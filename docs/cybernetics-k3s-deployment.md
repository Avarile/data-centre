# Cybernetics — k3s Deployment Runbook

How to ship a new `cybernetics` image to the k3s server. This is the
project-specific procedure; for general kubectl/k3s commands see
[k3s-cheatsheet.md](./k3s-cheatsheet.md).

---

## Table of Contents
1. [Why This Deployment Is Unusual](#1-why-this-deployment-is-unusual)
2. [Target Environment](#2-target-environment)
3. [Prerequisites](#3-prerequisites)
4. [Deployment Procedure](#4-deployment-procedure)
5. [Rollback](#5-rollback)
6. [Troubleshooting](#6-troubleshooting)
7. [Known Constraints](#7-known-constraints)
8. [Quick Reference](#8-quick-reference)

---

## 1. Why This Deployment Is Unusual

Three properties drive the whole procedure. Read these before deploying.

| Property | Consequence |
|---|---|
| `imagePullPolicy: Never` | There is **no registry**. The image must be side-loaded into the node's containerd by hand. |
| containerd socket is root-only, no passwordless sudo | The import step **cannot be automated**. A human runs one `sudo` command. |
| `strategy: Recreate`, `replicas: 1` | The old pod is killed **before** the new one starts. Every deploy is a brief outage, and a bad image turns that outage into a sustained one. |

The third point is why §4.3 (verify before shipping) is not optional. There is
no rolling-update safety net: if the new image cannot start, the service stays
down until you roll back.

---

## 2. Target Environment

Single-node cluster — the SSH alias and the node are the same machine.

```bash
# SSH alias            -> K3s-server
# Hostname             -> k8s-micro-server
# Internal IP          -> 192.168.0.103
# Role                 -> control-plane (single node, no workers)
# k3s                  -> v1.34.3+k3s1
# Runtime              -> containerd 2.1.5-k3s1
# OS                   -> Debian 13 (trixie), amd64
```

Workload topology:

```bash
# Namespace            -> cybernetics
# Deployment           -> cybernetics        (1 replica, Recreate)
# Container            -> cybernetics
# Service              -> cybernetics        NodePort 3000:30300, 3001:30301
# Ports                -> 3000 (http), 3001 (socket)
# Config               -> configMapRef: cybernetics-config
# Secrets              -> secretRef: cybernetics-secret
# Storage              -> cybernetics-pvc -> cybernetics-pv (10Gi, RWO, manual)
#                         mounted at /app/.assets
# Resources            -> requests 500m/1Gi, limits 2/4Gi
# Probes               -> liveness/readiness/startup: HTTP GET :3000/health
```

Storage is a PVC, so `/app/.assets` survives deploys. Database migrations run
in-process at container start via `scripts/start.sh`; there is no separate
migration Job or workload in the cluster.

---

## 3. Prerequisites

```bash
# On your workstation
docker          # builds the image
zstd            # compresses the transfer stream
ssh K3s-server  # working SSH alias

# On the node — you need the sudo PASSWORD, not just group membership.
# Being in the sudo group is not enough: sudo prompts, and `sudo -n` fails.
```

Disk: the image is ~4.66 GB, the transferred tar ~880 MB (layers ship
compressed). The node needs a few GB free in `$HOME` and
`/var/lib/rancher`. Do **not** stage in `/tmp` — it is a 7.7 GB tmpfs.

---

## 4. Deployment Procedure

### 4.1 Build

```bash
make build.app
```

This runs `scripts/build-image.mjs`, which stamps a release ID and applies two
tags:

```bash
# cybernetics:release.<UTC-timestamp>.<seq>   <- deploy THIS one
# cybernetics:develop                         <- moving tag, do not deploy
```

Always deploy the unique `release.*` tag. It matches the existing convention on
the deployment and guarantees the rollout actually triggers — re-pushing a
moving tag like `develop` may not.

Note the image ID and tag:

```bash
docker images --format '{{.ID}}\t{{.Repository}}:{{.Tag}}\t{{.CreatedSince}}' \
  | grep cybernetics
```

### 4.2 Capture the current state (for rollback)

```bash
ssh K3s-server "kubectl -n cybernetics get deploy cybernetics -o yaml" \
  > /tmp/cybernetics-deploy-before.yaml

ssh K3s-server "kubectl -n cybernetics rollout history deploy/cybernetics"
```

### 4.3 Verify the image BEFORE shipping it

**Do not skip this.** A successful build is not evidence the container runs.
Both checks are cheap; the transfer and the outage are not.

```bash
IMG=cybernetics:release.<timestamp>.1

# a) entrypoint must be executable — COPY preserves host file modes
docker run --rm --entrypoint /bin/sh $IMG -c 'ls -la scripts/start.sh'
# expect: -rwxr-xr-x   (NOT -rw-r--r--)

# b) the real entrypoint must actually exec and reach app startup
timeout 25 docker run --rm $IMG skip-migrate 2>&1 | head -15
# expect: "Skipping database migration...", then Next.js/NestJS boot lines.
# Errors about AI_GATEWAY_API_KEY / CYBERNETICS_APP_TOKEN being undefined are
# EXPECTED here — those come from cybernetics-secret in-cluster. Reaching that
# error proves the exec path works, which is what this check is for.
```

Check (b) subsumes (a) and catches more. Run both.

### 4.4 Transfer to the node

Streamed and compressed in transit, decompressed on arrival — no large
intermediate file on your workstation.

```bash
TAG=release.<timestamp>.1

docker save cybernetics:$TAG \
  | zstd -T0 -3 -c \
  | ssh K3s-server "zstd -dc > ~/cybernetics-$TAG.tar"
```

Verify the tar landed intact and carries the image you expect:

```bash
ssh K3s-server "tar -tf ~/cybernetics-$TAG.tar >/dev/null && echo 'tar OK'
                tar -xOf ~/cybernetics-$TAG.tar index.json | head -c 400"
# The digest in index.json must match the image ID from 4.1, and
# io.containerd.image.name must read docker.io/library/cybernetics:<TAG>
```

### 4.5 Import into containerd — MANUAL STEP

This requires root on the node and **cannot be scripted from a remote agent**.
`-t` allocates a TTY so sudo can prompt for the password.

```bash
ssh -t K3s-server "sudo k3s ctr -n k8s.io images import ~/cybernetics-<TAG>.tar"
```

The `-n k8s.io` namespace is mandatory — that is the containerd namespace the
kubelet reads. An import into the default namespace is invisible to Kubernetes.

Expect `unpacking docker.io/library/cybernetics:<TAG> ... done`. The progress
line truncates the tag to fit the terminal width; that is cosmetic.

Optionally remove a superseded image in the same sudo session:

```bash
ssh -t K3s-server "sudo k3s ctr -n k8s.io images import ~/cybernetics-<TAG>.tar \
  && sudo k3s ctr -n k8s.io images rm docker.io/library/cybernetics:<OLD-TAG>"
```

### 4.6 Confirm the kubelet can see it

You cannot run `ctr` without sudo, but the kubelet publishes its image list on
the node object — no privileges needed:

```bash
ssh K3s-server "kubectl get node k8s-micro-server -o json \
  | grep -o 'docker.io/library/cybernetics:[^\"]*' | sort -u"
```

A Kubernetes ref of `cybernetics:TAG` resolves to
`docker.io/library/cybernetics:TAG`; that exact string must appear.

**This list lags.** It refreshes on the kubelet's node-status interval, so a
freshly imported image can take up to a minute to show. Poll rather than
concluding the import failed:

```bash
until ssh K3s-server "kubectl get node k8s-micro-server -o json \
  | grep -q 'cybernetics:<TAG>'"; do sleep 10; done; echo "visible"
```

### 4.7 Roll out

```bash
ssh K3s-server "kubectl -n cybernetics set image \
  deploy/cybernetics cybernetics=cybernetics:<TAG>"

# Record why, so `rollout history` is readable later
ssh K3s-server "kubectl -n cybernetics annotate deploy/cybernetics \
  kubernetes.io/change-cause='image <id> (<TAG>) - <reason>' --overwrite"

ssh K3s-server "kubectl -n cybernetics rollout status deploy/cybernetics --timeout=300s"
```

Downtime starts here and lasts until the new pod passes its startup probe.

### 4.8 Verify the deployment

```bash
# Pod healthy, zero restarts
ssh K3s-server "kubectl -n cybernetics get pods -o wide"

# Live image is what you intended
ssh K3s-server "kubectl -n cybernetics get deploy cybernetics \
  -o jsonpath='{.spec.template.spec.containers[0].image}{\"\n\"}'"

# /health reports both databases up
ssh K3s-server "kubectl -n cybernetics run healthcheck --rm -i --restart=Never \
  --image=busybox --quiet -- wget -qO- --timeout=10 http://cybernetics:3000/health"
# expect: {"status":"ok","info":{"metaDatabase":{"status":"up"},
#          "dataDatabase":{"status":"up"}}, ...}

# Migrations ran. NOTE: use the POD NAME, not `-l app=cybernetics` — the label
# selector form does not return the earliest lines, and the migration output
# happens before the app starts logging.
ssh K3s-server "kubectl -n cybernetics logs <pod-name> | grep -i migration | head"
# expect: "Running database migration...", "<n> migrations found", and either
#         "No pending migrations to apply." or applied-migration lines
```

### 4.9 Clean up

```bash
ssh K3s-server "rm -f ~/cybernetics-<TAG>.tar"
```

Leave the previous image in containerd — it is what `rollout undo` needs.

---

## 5. Rollback

```bash
ssh K3s-server "kubectl -n cybernetics rollout undo deploy/cybernetics"
ssh K3s-server "kubectl -n cybernetics rollout status deploy/cybernetics --timeout=180s"

# To a specific revision
ssh K3s-server "kubectl -n cybernetics rollout history deploy/cybernetics"
ssh K3s-server "kubectl -n cybernetics rollout undo deploy/cybernetics --to-revision=<n>"
```

This works only while the previous image is still in the node's containerd. If
you pruned it, rollback means repeating §4.4–4.7 with the older tar — so do not
prune the currently-serving image.

---

## 6. Troubleshooting

### CrashLoopBackOff — `permission denied` on the entrypoint

```
failed to create containerd task: OCI runtime create failed: runc create failed:
unable to start container process: error during container init:
exec: "scripts/start.sh": permission denied
```

The entrypoint script is not executable inside the image. `COPY` preserves the
host/git file mode, so a checkout that lost the exec bit produces an image that
builds cleanly and then cannot start. Running as root does not help — exec
requires the bit regardless of user.

Diagnose and fix:

```bash
git ls-files -s scripts/start.sh     # want 100755, not 100644
chmod +x scripts/start.sh
git update-index --chmod=+x scripts/start.sh
```

The Dockerfile now hardens this with `COPY --chmod=0755` on `scripts/start.sh`,
so the image no longer depends on host modes. Keep §4.3's check anyway — it
catches failure modes beyond this one.

A repo-wide `chmod` sweep is the usual cause. To find one:

```bash
git diff --summary <commit>^ <commit> | grep "mode change 100755 => 100644"
```

Restore the bit only on real executables (shebang-bearing scripts, git hooks) —
not on `.svg`/`.png`/`.md` assets that should never have been 755.

### `ErrImageNeverPull` / `ImagePullBackOff`

The image is not in containerd under the name the deployment requests. Either
the import went to the wrong containerd namespace (§4.5 — must be `-n k8s.io`)
or the tag does not match. Compare §4.6's output against the deployment's image
ref exactly.

### New image not visible in `kubectl get node`

Almost always node-status lag, not a failed import — see §4.6 and poll.

### Inspecting containerd directly

Requires the sudo password:

```bash
ssh -t K3s-server "sudo k3s ctr -n k8s.io images ls | grep cybernetics"
ssh -t K3s-server "sudo k3s crictl images | grep cybernetics"
```

---

## 7. Known Constraints

**The sudo wall.** `/run/k3s/containerd/containerd.sock` is `srw-rw---- root
root`, and the node has no NOPASSWD rule. Any automation of this deployment
stops at §4.5 and needs a human. Plan around it rather than trying to work
around it.

**Editing the Dockerfile costs a full rebuild.** `dockers/` is not in
`.dockerignore` and the deps stage does `COPY --link . .`, so the Dockerfile is
copied into its own build context. *Any* edit to it changes that layer's cache
key and invalidates `deps` → `builder` → `post-builder` → `runner`. Do not
expect a cheap tail-only rebuild; budget for the full one (~17 min).

**Every deploy is an outage.** `Recreate` + 1 replica. Switching to
`RollingUpdate` only helps if the app tolerates two concurrent instances — it
writes to a RWO volume and runs migrations at startup, so that needs
verification first, not assumption.

**`develop` is a moving tag.** Both tags point at the same image after a build.
Deploying `develop` makes `rollout history` ambiguous and may not trigger a
rollout at all.

---

## 8. Quick Reference

Full deploy, condensed. `<TAG>` is the `release.*` tag from `make build.app`.

```bash
# 1. build
make build.app

# 2. verify BEFORE shipping (do not skip)
timeout 25 docker run --rm cybernetics:<TAG> skip-migrate 2>&1 | head -15

# 3. transfer
docker save cybernetics:<TAG> | zstd -T0 -3 -c \
  | ssh K3s-server "zstd -dc > ~/cybernetics-<TAG>.tar"

# 4. import  <-- MANUAL, needs sudo password
ssh -t K3s-server "sudo k3s ctr -n k8s.io images import ~/cybernetics-<TAG>.tar"

# 5. confirm kubelet sees it (may lag ~1 min)
ssh K3s-server "kubectl get node k8s-micro-server -o json \
  | grep -o 'docker.io/library/cybernetics:[^\"]*' | sort -u"

# 6. roll out  <-- downtime starts
ssh K3s-server "kubectl -n cybernetics set image \
  deploy/cybernetics cybernetics=cybernetics:<TAG>"
ssh K3s-server "kubectl -n cybernetics rollout status deploy/cybernetics --timeout=300s"

# 7. verify
ssh K3s-server "kubectl -n cybernetics get pods -o wide"
ssh K3s-server "kubectl -n cybernetics run healthcheck --rm -i --restart=Never \
  --image=busybox --quiet -- wget -qO- http://cybernetics:3000/health"

# 8. clean up
ssh K3s-server "rm -f ~/cybernetics-<TAG>.tar"

# rollback if needed
ssh K3s-server "kubectl -n cybernetics rollout undo deploy/cybernetics"
```

---

*Written: 2026-08-15 | k3s v1.34.3+k3s1 | derived from the
`release.2026-08-15T02-19-05Z.1` deployment*
