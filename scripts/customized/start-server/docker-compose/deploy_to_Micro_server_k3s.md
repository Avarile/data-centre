Deploy cybernetics:release.2026-09-19T03-59-44Z.1 to the K3s node

Context

The Dockerfile corepack/PATH fix (previous task) is done and make build.app produced a
fresh image. It now needs to reach the single-node k3s cluster behind ssh K3s-server,
replacing the image that deployment/cybernetics has been running for 26 days.

Verified facts that shape the procedure:

┌─────────────────────────┬────────────────────────────────────────────────────────────────────────────────────┐
│ Fact │ Value │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ New image │ cybernetics:release.2026-09-19T03-59-44Z.1 = cybernetics:develop, sha256:8843a321… │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ docker save stream │ 0.82 GB (already-compressed blobs — zstd only gains 1.05x, so skip compression) │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ Node │ k8s-micro-server @ 192.168.0.103, single node, ssh user avarile │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ Currently running │ cybernetics:release.2026-08-23T04-21-35Z.1, pod up 26d, revision 14 │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ deployment.yaml on disk │ release.2026-08-18T06-30-44Z.1 — one release behind what runs │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ Manifests location │ on the remote, ~/dev-ops/k3s-deployment/apps/cybernetics (git, clean tree) │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
│ Node free disk │ 267 G │
└─────────────────────────┴────────────────────────────────────────────────────────────────────────────────────┘

Three constraints drive every step below:

1.  No registry for this workload. imagePullPolicy: Never, so the image must be
    side-loaded into the node's containerd. (A gitea.avarile.com registry exists and
    holds other images, but this deployment is pinned to local docker.io/library tags —
    staying on the side-load path.)
2.  sudo on the node requires a password. /run/k3s/containerd/containerd.sock is
    root-only, so the import step must be run by the user, not by me.
3.  strategy: Recreate, replicas: 1 — the old pod is killed before the new one
    starts. Brief downtime, and a bad image becomes an outage rather than a stuck rollout.
    Hence the local smoke test in step 1.

Two drift issues found (decided)

- deployment.yaml is stale because past deploys used kubectl set image and never wrote
  the tag back. Per your choice: bump the file and commit it — that is what stops the
  drift recurring.
- The live ConfigMap points 4 browser-facing keys (PUBLIC_ORIGIN, STORAGE_PREFIX,
  BACKEND_STORAGE_PUBLIC_URL, PUBLIC_DATABASE_PROXY) at 192.168.0.102, which is dead
  (verified unreachable from both the node and this workstation; .103 returns 200).
  Per your choice: leave it alone this deploy. This is why the plan uses
  kubectl apply -f deployment.yaml and not kubectl apply -k — the kustomization
  would drag the ConfigMap fix in. See "Known issue left open" below.

Procedure

1.  Smoke-test the image locally (before the destructive rollout)

docker run --rm cybernetics:release.2026-09-19T03-59-44Z.1 skip-migrate

Must reach app startup. Missing AI_GATEWAY_API_KEY / CYBERNETICS_APP_TOKEN errors are
expected outside the cluster and still prove the entrypoint executed. A
exec: "scripts/start.sh": permission denied here means stop — do not transfer.
(dockers/teable/Dockerfile:189 now carries --chmod=0755, so this should pass; the
check stays because Recreate gives no safety net.)

2.  Transfer (me, ~0.82 GB over LAN)

docker save cybernetics:release.2026-09-19T03-59-44Z.1 \
 | ssh K3s-server 'cat > ~/cybernetics-2026-09-19.tar'
ssh K3s-server 'ls -lh ~/cybernetics-2026-09-19.tar'

No zstd in the pipe — measured ratio is 1.05x, so it would only add CPU.

3.  Import into containerd — you must run this (sudo password)

! ssh -t K3s-server 'sudo k3s ctr -n k8s.io images import ~/cybernetics-2026-09-19.tar'

-t allocates the TTY for the password prompt; -n k8s.io is the namespace the kubelet
reads. Expect ~1 minute and an unpacking …done line.

4.  Verify the import (me, no sudo needed — via the kubelet's view)

ssh K3s-server 'kubectl get node k8s-micro-server -o json \
 | grep -o "docker.io/library/cybernetics:[^\"]\*" | sort -u'

docker.io/library/cybernetics:release.2026-09-19T03-59-44Z.1 must appear exactly.
Node status can lag a few seconds; retry before concluding it failed. Do not proceed
past this point without that string — with Never, a missing import means the pod
cannot start and Recreate has already killed the old one.

5.  Bump the tag in the manifest (me, on the remote)

~/dev-ops/k3s-deployment/apps/cybernetics/deployment.yaml, the image: line:

image: cybernetics:release.2026-09-19T03-59-44Z.1

6.  Roll it out (me) — brief downtime starts here

ssh K3s-server 'cd ~/dev-ops/k3s-deployment \
 && kubectl apply -f apps/cybernetics/deployment.yaml \
 && kubectl -n cybernetics annotate deploy/cybernetics \
 kubernetes.io/change-cause="image release.2026-09-19T03-59-44Z.1 - corepack/PNPM_HOME Dockerfile fix" --overwrite \
 && kubectl -n cybernetics rollout status deploy/cybernetics --timeout=12m'

apply -f (not -k) is deliberate — it updates the Deployment only and leaves the
ConfigMap untouched, per your decision. It also repairs the Deployment's
last-applied-configuration, which currently still records the June image.
The 12m timeout covers the startupProbe budget (60 × 10s) for Prisma migrations.

7.  Commit the tag back (me)

ssh K3s-server 'cd ~/dev-ops/k3s-deployment \
 && git add apps/cybernetics/deployment.yaml \
 && git commit -m "chore(cybernetics): bump image to release.2026-09-19T03-59-44Z.1"'

8.  Clean up

ssh K3s-server 'rm -f ~/cybernetics-2026-09-19.tar'

Leave the old images in containerd — rollout undo depends on
release.2026-08-23T04-21-35Z.1 still being present. # pod running on the new image
ssh K3s-server 'kubectl -n cybernetics get pods -o wide; \
 kubectl -n cybernetics get deploy cybernetics \
 -o jsonpath="{.spec.template.spec.containers[0].image}{\"\n\"}"'

     # health endpoint, from this workstation (not just the node)
     curl -s -o /dev/null -w "%{http_code}\n" http://192.168.0.103:30300/health   # expect 200

     # no crash loop / migration failure
     ssh K3s-server 'kubectl -n cybernetics logs deploy/cybernetics --tail=40'

     Expected: one Running 1/1 pod with 0 restarts on the new tag, /health → 200, and
     migration lines followed by app startup in the logs.

     Rollback

     ssh K3s-server 'kubectl -n cybernetics rollout undo deploy/cybernetics \
       && kubectl -n cybernetics rollout status deploy/cybernetics --timeout=12m'

     Returns to release.2026-08-23T04-21-35Z.1, which is already on the node. If the
     rollback is used, revert the step-7 commit too so the file matches reality again.

     Known issue left open (by decision)

     The live ConfigMap keeps 192.168.0.102 in PUBLIC_ORIGIN, STORAGE_PREFIX,
     BACKEND_STORAGE_PUBLIC_URL and PUBLIC_DATABASE_PROXY, while the node is .103 and
     .102 answers nothing. The app itself serves fine on .103:30300, but any URL it hands
     the browser (asset links, redirects, the DB-proxy address) points at a dead host. The
     checked-in manifest already has the correct value, so this is one kubectl apply -k away
     whenever you want it — and note that anyone running apply -k will flip these silently,
     since the file and the cluster disagree. The live Secret contains no IP references, so
     nothing else needs changing alongside it.
