# k3s Cheatsheet

---

## Table of Contents
1. [Service Management](#1-service-management)
2. [Cluster Info & Health](#2-cluster-info--health)
3. [Node Management](#3-node-management)
4. [Namespaces](#4-namespaces)
5. [Pods](#5-pods)
6. [Deployments](#6-deployments)
7. [ReplicaSets & DaemonSets](#7-replicasets--daemonsets)
8. [StatefulSets](#8-statefulsets)
9. [Jobs & CronJobs](#9-jobs--cronjobs)
10. [Services & Networking](#10-services--networking)
11. [Ingress](#11-ingress)
12. [ConfigMaps](#12-configmaps)
13. [Secrets](#13-secrets)
14. [Persistent Volumes & Storage](#14-persistent-volumes--storage)
15. [RBAC](#15-rbac)
16. [Logs & Debugging](#16-logs--debugging)
17. [Exec & Port Forwarding](#17-exec--port-forwarding)
18. [Resource Management & Scaling](#18-resource-management--scaling)
19. [Rollouts & History](#19-rollouts--history)
20. [Labels, Annotations & Selectors](#20-labels-annotations--selectors)
21. [Contexts & Kubeconfig](#21-contexts--kubeconfig)
22. [Helm (via k3s)](#22-helm-via-k3s)
23. [k3s-Specific Commands](#23-k3s-specific-commands)
24. [Cluster Add/Remove Nodes](#24-cluster-addremove-nodes)
25. [Backup & Restore (etcd/SQLite)](#25-backup--restore-etcdsqlite)
26. [Networking & CNI (Flannel)](#26-networking--cni-flannel)
27. [Certificates & TLS](#27-certificates--tls)
28. [Apply, Diff & Dry-Run](#28-apply-diff--dry-run)
29. [Useful One-Liners](#29-useful-one-liners)

---

## 1. Service Management

```bash
# Start k3s
sudo systemctl start k3s

# Stop k3s
sudo systemctl stop k3s

# Restart k3s
sudo systemctl restart k3s

# Enable k3s on boot
sudo systemctl enable k3s

# Disable k3s on boot
sudo systemctl disable k3s

# Enable and start in one command
sudo systemctl enable --now k3s

# Check k3s service status
sudo systemctl status k3s

# View live k3s service logs
sudo journalctl -u k3s -f

# View last 100 lines of k3s logs
sudo journalctl -u k3s -n 100

# Agent (worker node) service
sudo systemctl start k3s-agent
sudo systemctl stop k3s-agent
sudo systemctl status k3s-agent
sudo journalctl -u k3s-agent -f
```

---

## 2. Cluster Info & Health

```bash
# Cluster info
kubectl cluster-info

# Full cluster component status
kubectl get componentstatuses

# API server version
kubectl version

# List all API resources available
kubectl api-resources

# List all API versions
kubectl api-versions

# Check node resource usage (requires metrics-server)
kubectl top nodes

# Check pod resource usage
kubectl top pods
kubectl top pods -A                         # all namespaces
kubectl top pods -n <namespace>

# View all events (sorted by time)
kubectl get events --sort-by='.lastTimestamp' -A

# View events in a namespace
kubectl get events -n <namespace>

# Describe an event
kubectl describe event <event-name> -n <namespace>
```

---

## 3. Node Management

```bash
# List all nodes
kubectl get nodes
kubectl get nodes -o wide                   # with IP, OS, kernel info

# Describe a node
kubectl describe node <node-name>

# Get node labels
kubectl get node <node-name> --show-labels

# Add label to node
kubectl label node <node-name> key=value

# Remove label from node
kubectl label node <node-name> key-

# Taint a node (prevent scheduling)
kubectl taint node <node-name> key=value:NoSchedule
kubectl taint node <node-name> key=value:NoExecute
kubectl taint node <node-name> key=value:PreferNoSchedule

# Remove taint
kubectl taint node <node-name> key:NoSchedule-

# Cordon node (mark unschedulable)
kubectl cordon <node-name>

# Uncordon node (mark schedulable)
kubectl uncordon <node-name>

# Drain node (evict pods, cordon first)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Drain with force
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data --force

# Get node resource capacity
kubectl get node <node-name> -o jsonpath='{.status.capacity}'

# Watch nodes
kubectl get nodes -w
```

---

## 4. Namespaces

```bash
# List namespaces
kubectl get namespaces
kubectl get ns

# Create namespace
kubectl create namespace <name>
kubectl create ns <name>

# Delete namespace (deletes ALL resources inside)
kubectl delete namespace <name>

# Describe namespace
kubectl describe namespace <name>

# Set default namespace for current context
kubectl config set-context --current --namespace=<name>

# View current namespace
kubectl config view --minify | grep namespace

# Get all resources across all namespaces
kubectl get all -A
kubectl get pods -A
```

---

## 5. Pods

```bash
# List pods
kubectl get pods
kubectl get pods -n <namespace>
kubectl get pods -A                         # all namespaces
kubectl get pods -o wide                    # with node, IP
kubectl get pods -o yaml                    # full YAML
kubectl get pods -o json                    # full JSON

# Watch pods (live)
kubectl get pods -w
kubectl get pods -w -n <namespace>

# Describe pod
kubectl describe pod <pod-name>
kubectl describe pod <pod-name> -n <namespace>

# Delete pod
kubectl delete pod <pod-name>
kubectl delete pod <pod-name> -n <namespace>
kubectl delete pod <pod-name> --force --grace-period=0   # immediate

# Delete all pods in namespace
kubectl delete pods --all -n <namespace>

# Delete pods matching label
kubectl delete pods -l app=<label>

# Get pod YAML
kubectl get pod <pod-name> -o yaml

# Get pod IP
kubectl get pod <pod-name> -o jsonpath='{.status.podIP}'

# Get pod node
kubectl get pod <pod-name> -o jsonpath='{.spec.nodeName}'

# Run a temporary pod (busybox shell)
kubectl run tmp --image=busybox --restart=Never --rm -it -- sh

# Run a temporary pod with specific image
kubectl run tmp --image=alpine:3.18 --restart=Never --rm -it -- sh

# Run a pod from YAML
kubectl run <name> --image=<image> --port=<port>

# Copy file to/from pod
kubectl cp <local-file> <namespace>/<pod>:<path>
kubectl cp <namespace>/<pod>:<path> <local-file>

# Get init container logs
kubectl logs <pod-name> -c <init-container-name>

# List containers in a pod
kubectl get pod <pod-name> -o jsonpath='{.spec.containers[*].name}'
```

---

## 6. Deployments

```bash
# List deployments
kubectl get deployments
kubectl get deploy
kubectl get deploy -n <namespace>
kubectl get deploy -A

# Describe deployment
kubectl describe deploy <name>

# Create deployment
kubectl create deployment <name> --image=<image>
kubectl create deployment <name> --image=<image> --replicas=3

# Apply deployment from file
kubectl apply -f deployment.yaml

# Edit deployment live
kubectl edit deploy <name>

# Delete deployment
kubectl delete deploy <name>

# Scale deployment
kubectl scale deploy <name> --replicas=5

# Set image (triggers rolling update)
kubectl set image deploy/<name> <container>=<new-image>:<tag>

# Update environment variable
kubectl set env deploy/<name> KEY=VALUE

# Get deployment YAML
kubectl get deploy <name> -o yaml

# Watch deployment rollout
kubectl rollout status deploy/<name>

# Expose deployment as service
kubectl expose deploy <name> --port=80 --target-port=8080 --type=ClusterIP
kubectl expose deploy <name> --port=80 --target-port=8080 --type=NodePort
kubectl expose deploy <name> --port=80 --target-port=8080 --type=LoadBalancer
```

---

## 7. ReplicaSets & DaemonSets

```bash
# List replicasets
kubectl get rs
kubectl get rs -n <namespace>

# Describe replicaset
kubectl describe rs <name>

# List daemonsets
kubectl get daemonsets
kubectl get ds
kubectl get ds -A

# Describe daemonset
kubectl describe ds <name>

# Delete daemonset
kubectl delete ds <name>

# Apply daemonset
kubectl apply -f daemonset.yaml
```

---

## 8. StatefulSets

```bash
# List statefulsets
kubectl get statefulsets
kubectl get sts
kubectl get sts -A

# Describe statefulset
kubectl describe sts <name>

# Scale statefulset
kubectl scale sts <name> --replicas=3

# Delete statefulset (keep PVCs)
kubectl delete sts <name>

# Delete statefulset and PVCs
kubectl delete sts <name> && kubectl delete pvc -l app=<label>

# Watch statefulset pods
kubectl get pods -l app=<name> -w
```

---

## 9. Jobs & CronJobs

```bash
# List jobs
kubectl get jobs
kubectl get jobs -A

# Describe job
kubectl describe job <name>

# Create a one-time job
kubectl create job <name> --image=<image>

# Create job from cronjob
kubectl create job <name> --from=cronjob/<cronjob-name>

# Delete job
kubectl delete job <name>

# List cronjobs
kubectl get cronjobs
kubectl get cj

# Describe cronjob
kubectl describe cj <name>

# Create cronjob
kubectl create cronjob <name> --image=<image> --schedule="*/5 * * * *"

# Suspend cronjob
kubectl patch cj <name> -p '{"spec":{"suspend":true}}'

# Resume cronjob
kubectl patch cj <name> -p '{"spec":{"suspend":false}}'

# Delete cronjob
kubectl delete cj <name>
```

---

## 10. Services & Networking

```bash
# List services
kubectl get services
kubectl get svc
kubectl get svc -A
kubectl get svc -o wide

# Describe service
kubectl describe svc <name>

# Delete service
kubectl delete svc <name>

# Create ClusterIP service
kubectl create service clusterip <name> --tcp=80:8080

# Create NodePort service
kubectl create service nodeport <name> --tcp=80:8080

# Create LoadBalancer service
kubectl create service loadbalancer <name> --tcp=80:8080

# Get service endpoints
kubectl get endpoints
kubectl get ep <service-name>

# Get external IP of service
kubectl get svc <name> -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# Get NodePort
kubectl get svc <name> -o jsonpath='{.spec.ports[0].nodePort}'

# List network policies
kubectl get networkpolicies
kubectl get netpol

# Describe network policy
kubectl describe netpol <name>

# DNS lookup inside cluster (run from a pod)
nslookup <service-name>.<namespace>.svc.cluster.local
```

---

## 11. Ingress

```bash
# List ingress resources
kubectl get ingress
kubectl get ing
kubectl get ing -A

# Describe ingress
kubectl describe ing <name>

# Apply ingress from file
kubectl apply -f ingress.yaml

# Delete ingress
kubectl delete ing <name>

# List ingress classes
kubectl get ingressclass

# Describe ingress class
kubectl describe ingressclass <name>
```

---

## 12. ConfigMaps

```bash
# List configmaps
kubectl get configmaps
kubectl get cm
kubectl get cm -A

# Describe configmap
kubectl describe cm <name>

# Create configmap from literal
kubectl create cm <name> --from-literal=key=value

# Create configmap from file
kubectl create cm <name> --from-file=<file>

# Create configmap from env file
kubectl create cm <name> --from-env-file=<file.env>

# Get configmap YAML
kubectl get cm <name> -o yaml

# Edit configmap
kubectl edit cm <name>

# Delete configmap
kubectl delete cm <name>

# Patch configmap
kubectl patch cm <name> -p '{"data":{"key":"newvalue"}}'
```

---

## 13. Secrets

```bash
# List secrets
kubectl get secrets
kubectl get secrets -A

# Describe secret (values are base64 encoded)
kubectl describe secret <name>

# Create generic secret from literal
kubectl create secret generic <name> --from-literal=key=value

# Create secret from file
kubectl create secret generic <name> --from-file=<file>

# Create TLS secret
kubectl create secret tls <name> --cert=tls.crt --key=tls.key

# Create docker registry secret
kubectl create secret docker-registry <name> \
  --docker-server=<server> \
  --docker-username=<user> \
  --docker-password=<pass> \
  --docker-email=<email>

# Get secret value (decode base64)
kubectl get secret <name> -o jsonpath='{.data.<key>}' | base64 --decode

# Get all secret data decoded
kubectl get secret <name> -o json | jq '.data | map_values(@base64d)'

# Edit secret
kubectl edit secret <name>

# Delete secret
kubectl delete secret <name>
```

---

## 14. Persistent Volumes & Storage

```bash
# List persistent volumes (cluster-wide)
kubectl get pv
kubectl get pv -o wide

# Describe persistent volume
kubectl describe pv <name>

# Delete persistent volume
kubectl delete pv <name>

# List persistent volume claims
kubectl get pvc
kubectl get pvc -n <namespace>
kubectl get pvc -A

# Describe PVC
kubectl describe pvc <name>

# Delete PVC
kubectl delete pvc <name>

# List storage classes
kubectl get storageclass
kubectl get sc

# Describe storage class
kubectl describe sc <name>

# Set default storage class
kubectl patch sc <name> -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'

# List volume snapshots (if VolumeSnapshot CRDs installed)
kubectl get volumesnapshot -A
kubectl get volumesnapshotclass

# Force delete stuck PVC (remove finalizer)
kubectl patch pvc <name> -p '{"metadata":{"finalizers":null}}'
```

---

## 15. RBAC

```bash
# List roles (namespace-scoped)
kubectl get roles -A

# List cluster roles (cluster-wide)
kubectl get clusterroles

# Describe role
kubectl describe role <name> -n <namespace>

# List role bindings
kubectl get rolebindings -A

# List cluster role bindings
kubectl get clusterrolebindings

# Describe role binding
kubectl describe rolebinding <name> -n <namespace>

# Create role (read pods)
kubectl create role <name> --verb=get,list,watch --resource=pods

# Create cluster role
kubectl create clusterrole <name> --verb=get,list,watch --resource=pods

# Create role binding (user to role)
kubectl create rolebinding <name> --role=<role> --user=<user> -n <namespace>

# Create cluster role binding
kubectl create clusterrolebinding <name> --clusterrole=<role> --user=<user>

# Bind service account to role
kubectl create rolebinding <name> --role=<role> --serviceaccount=<ns>:<sa>

# Check what a user can do
kubectl auth can-i get pods --as=<user>
kubectl auth can-i '*' '*'                  # check all permissions
kubectl auth can-i create deployments --as=<user> -n <namespace>

# List service accounts
kubectl get serviceaccounts
kubectl get sa

# Create service account
kubectl create sa <name>

# Get service account token
kubectl get secret $(kubectl get sa <name> -o jsonpath='{.secrets[0].name}') \
  -o jsonpath='{.data.token}' | base64 --decode
```

---

## 16. Logs & Debugging

```bash
# Pod logs
kubectl logs <pod-name>
kubectl logs <pod-name> -n <namespace>

# Follow (tail) logs
kubectl logs <pod-name> -f

# Last N lines
kubectl logs <pod-name> --tail=100

# Logs since duration
kubectl logs <pod-name> --since=1h
kubectl logs <pod-name> --since=30m

# Previous container logs (after crash)
kubectl logs <pod-name> --previous
kubectl logs <pod-name> -p

# Specific container in multi-container pod
kubectl logs <pod-name> -c <container-name>

# All containers in pod
kubectl logs <pod-name> --all-containers=true

# Logs from all pods matching label
kubectl logs -l app=<label> -f --all-containers=true

# Describe (events + status)
kubectl describe pod <pod-name>
kubectl describe deploy <name>
kubectl describe node <name>
kubectl describe svc <name>

# Get events for a resource
kubectl get events --field-selector involvedObject.name=<pod-name>

# Debug with ephemeral container (k8s 1.23+)
kubectl debug -it <pod-name> --image=busybox --target=<container>

# Run debug pod on specific node
kubectl debug node/<node-name> -it --image=ubuntu

# Check pod conditions
kubectl get pod <pod-name> -o jsonpath='{.status.conditions}'

# Check container exit codes
kubectl get pod <pod-name> -o jsonpath='{.status.containerStatuses[*].lastState.terminated.exitCode}'

# k3s agent/server system logs
sudo journalctl -u k3s -f
sudo journalctl -u k3s-agent -f

# k3s containerd logs
sudo journalctl -u k3s -f | grep containerd
```

---

## 17. Exec & Port Forwarding

```bash
# Execute command in running pod
kubectl exec <pod-name> -- <command>
kubectl exec <pod-name> -- ls /app
kubectl exec <pod-name> -- env

# Interactive shell
kubectl exec -it <pod-name> -- /bin/bash
kubectl exec -it <pod-name> -- /bin/sh          # alpine/busybox

# Exec in specific container
kubectl exec -it <pod-name> -c <container> -- /bin/bash

# Exec in pod in specific namespace
kubectl exec -it <pod-name> -n <namespace> -- /bin/bash

# Port forward pod
kubectl port-forward pod/<pod-name> 8080:80

# Port forward service
kubectl port-forward svc/<service-name> 8080:80

# Port forward deployment
kubectl port-forward deploy/<name> 8080:80

# Port forward on all interfaces (allow external access)
kubectl port-forward --address 0.0.0.0 svc/<name> 8080:80

# Port forward in background
kubectl port-forward svc/<name> 8080:80 &

# Copy files to/from pod
kubectl cp <pod-name>:/path/to/file ./local-file
kubectl cp ./local-file <pod-name>:/path/to/file
kubectl cp <namespace>/<pod>:/path ./local
```

---

## 18. Resource Management & Scaling

```bash
# Set resource requests/limits on deployment
kubectl set resources deploy <name> \
  --requests=cpu=100m,memory=128Mi \
  --limits=cpu=500m,memory=512Mi

# Autoscale deployment (HPA)
kubectl autoscale deploy <name> --min=2 --max=10 --cpu-percent=80

# List HPAs
kubectl get hpa
kubectl get hpa -A

# Describe HPA
kubectl describe hpa <name>

# Delete HPA
kubectl delete hpa <name>

# List VPAs (if VPA installed)
kubectl get vpa -A

# View resource quotas
kubectl get resourcequota -A

# Describe resource quota
kubectl describe resourcequota <name> -n <namespace>

# Create resource quota
kubectl create quota <name> \
  --hard=pods=10,requests.cpu=4,limits.memory=8Gi \
  -n <namespace>

# List limit ranges
kubectl get limitrange -A

# Describe limit range
kubectl describe limitrange <name> -n <namespace>

# Check node allocatable resources
kubectl get node <name> -o jsonpath='{.status.allocatable}'
```

---

## 19. Rollouts & History

```bash
# Check rollout status
kubectl rollout status deploy/<name>
kubectl rollout status sts/<name>
kubectl rollout status ds/<name>

# View rollout history
kubectl rollout history deploy/<name>

# View specific revision
kubectl rollout history deploy/<name> --revision=2

# Rollback to previous version
kubectl rollout undo deploy/<name>

# Rollback to specific revision
kubectl rollout undo deploy/<name> --to-revision=2

# Pause rollout
kubectl rollout pause deploy/<name>

# Resume rollout
kubectl rollout resume deploy/<name>

# Restart all pods in deployment (triggers rolling update)
kubectl rollout restart deploy/<name>

# Restart daemonset
kubectl rollout restart ds/<name>

# Restart statefulset
kubectl rollout restart sts/<name>
```

---

## 20. Labels, Annotations & Selectors

```bash
# Show labels on pods
kubectl get pods --show-labels

# Filter by label selector
kubectl get pods -l app=nginx
kubectl get pods -l app=nginx,env=prod
kubectl get pods -l 'env in (prod,staging)'
kubectl get pods -l 'env notin (dev)'
kubectl get pods -l 'app'                   # has label key

# Add label
kubectl label pod <name> key=value
kubectl label node <name> key=value

# Update existing label
kubectl label pod <name> key=newvalue --overwrite

# Remove label
kubectl label pod <name> key-

# Add annotation
kubectl annotate pod <name> key=value

# Remove annotation
kubectl annotate pod <name> key-

# Get resources by field selector
kubectl get pods --field-selector=status.phase=Running
kubectl get pods --field-selector=spec.nodeName=<node>
kubectl get pods --field-selector=metadata.namespace=default

# Get pods NOT running
kubectl get pods --field-selector='status.phase!=Running'
```

---

## 21. Contexts & Kubeconfig

```bash
# View kubeconfig
kubectl config view
kubectl config view --minify                # current context only

# List contexts
kubectl config get-contexts

# Show current context
kubectl config current-context

# Switch context
kubectl config use-context <context-name>

# Set namespace for current context
kubectl config set-context --current --namespace=<namespace>

# Rename context
kubectl config rename-context <old> <new>

# Delete context
kubectl config delete-context <name>

# Add cluster to kubeconfig
kubectl config set-cluster <name> --server=https://<ip>:6443 \
  --certificate-authority=ca.crt

# Add user credentials
kubectl config set-credentials <user> --token=<token>

# Create new context
kubectl config set-context <name> --cluster=<cluster> --user=<user>

# Merge kubeconfigs
KUBECONFIG=~/.kube/config:/path/to/other/config kubectl config view --flatten > merged.yaml

# k3s kubeconfig location
sudo cat /etc/rancher/k3s/k3s.yaml

# Copy k3s kubeconfig for local use
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER ~/.kube/config
# Replace 127.0.0.1 with server IP if accessing remotely
sed -i 's/127.0.0.1/<server-ip>/g' ~/.kube/config
```

---

## 22. Helm (via k3s)

```bash
# Install Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Add repo
helm repo add <name> <url>
helm repo add stable https://charts.helm.sh/stable

# Update repos
helm repo update

# List repos
helm repo list

# Search chart
helm search repo <keyword>
helm search hub <keyword>

# Inspect chart
helm show chart <repo>/<chart>
helm show values <repo>/<chart>
helm show readme <repo>/<chart>

# Install chart
helm install <release> <repo>/<chart>
helm install <release> <repo>/<chart> -n <namespace> --create-namespace
helm install <release> <repo>/<chart> --set key=value
helm install <release> <repo>/<chart> -f values.yaml

# Upgrade release
helm upgrade <release> <repo>/<chart>
helm upgrade --install <release> <repo>/<chart>    # install if not exists

# Rollback release
helm rollback <release> <revision>
helm rollback <release> 0                          # previous revision

# List releases
helm list
helm list -A
helm list -n <namespace>

# Status of release
helm status <release>

# Uninstall release
helm uninstall <release>
helm uninstall <release> -n <namespace>

# Render templates without installing (dry-run)
helm template <release> <repo>/<chart>
helm install <release> <repo>/<chart> --dry-run

# Get release values
helm get values <release>
helm get all <release>

# History of release
helm history <release>

# Lint chart
helm lint ./my-chart

# Package chart
helm package ./my-chart
```

---

## 23. k3s-Specific Commands

```bash
# k3s binary location
which k3s
/usr/local/bin/k3s

# k3s version
k3s --version

# k3s kubectl (built-in, no separate kubectl needed)
k3s kubectl get nodes
k3s kubectl get pods -A

# k3s crictl (container runtime)
sudo k3s crictl ps                          # running containers
sudo k3s crictl ps -a                       # all containers
sudo k3s crictl images                      # local images
sudo k3s crictl pull <image>
sudo k3s crictl inspect <container-id>
sudo k3s crictl logs <container-id>
sudo k3s crictl rm <container-id>
sudo k3s crictl rmi <image>

# k3s ctr (containerd CLI)
sudo k3s ctr images list
sudo k3s ctr containers list
sudo k3s ctr tasks list

# k3s check-config (kernel/OS requirements)
k3s check-config

# Uninstall k3s (server)
/usr/local/bin/k3s-uninstall.sh

# Uninstall k3s agent
/usr/local/bin/k3s-agent-uninstall.sh

# Kill all k3s processes and cleanup
/usr/local/bin/k3s-killall.sh

# k3s config file location
sudo cat /etc/rancher/k3s/config.yaml

# k3s data dir
ls /var/lib/rancher/k3s/

# k3s static pod manifests
ls /var/lib/rancher/k3s/server/manifests/

# Drop a manifest to auto-deploy (HelmChart CRD)
sudo cp myapp.yaml /var/lib/rancher/k3s/server/manifests/

# k3s server token (for joining agents)
sudo cat /var/lib/rancher/k3s/server/node-token

# Start k3s with custom flags
sudo k3s server \
  --disable=traefik \
  --disable=servicelb \
  --cluster-cidr=10.42.0.0/16 \
  --service-cidr=10.43.0.0/16

# Start k3s server with embedded etcd (HA)
sudo k3s server --cluster-init

# Start k3s server joining existing HA cluster
sudo k3s server \
  --server https://<existing-server>:6443 \
  --token <token>

# Start k3s agent
sudo k3s agent \
  --server https://<server-ip>:6443 \
  --token <token>

# Enable/disable built-in components
# (pass to k3s server or add to /etc/rancher/k3s/config.yaml)
# disable: traefik, servicelb, metrics-server, local-storage, coredns
sudo k3s server --disable=traefik --disable=servicelb
```

---

## 24. Cluster Add/Remove Nodes

```bash
# Get join token from server
sudo cat /var/lib/rancher/k3s/server/node-token

# Join worker node to cluster
curl -sfL https://get.k3s.io | \
  K3S_URL=https://<server-ip>:6443 \
  K3S_TOKEN=<token> \
  sh -

# Join with specific node name
curl -sfL https://get.k3s.io | \
  K3S_URL=https://<server-ip>:6443 \
  K3S_TOKEN=<token> \
  K3S_NODE_NAME=<name> \
  sh -

# Join additional control plane (HA with embedded etcd)
curl -sfL https://get.k3s.io | \
  K3S_TOKEN=<token> \
  sh -s - server \
  --server https://<existing-server>:6443

# Remove node from cluster (run on server)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
kubectl delete node <node-name>

# Uninstall agent on the node itself
/usr/local/bin/k3s-agent-uninstall.sh
```

---

## 25. Backup & Restore (etcd/SQLite)

```bash
# k3s default: SQLite (single node)
# k3s HA: embedded etcd or external DB

# SQLite DB location
ls /var/lib/rancher/k3s/server/db/

# Backup SQLite
sudo sqlite3 /var/lib/rancher/k3s/server/db/state.db ".backup /tmp/k3s-backup.db"

# Embedded etcd snapshot (on demand)
sudo k3s etcd-snapshot save

# List etcd snapshots
sudo k3s etcd-snapshot list

# Restore from etcd snapshot
sudo systemctl stop k3s
sudo k3s server \
  --cluster-reset \
  --cluster-reset-restore-path=/var/lib/rancher/k3s/server/db/snapshots/<snapshot>
sudo systemctl start k3s

# Automated snapshot config (in /etc/rancher/k3s/config.yaml)
# etcd-snapshot-schedule-cron: "0 */6 * * *"
# etcd-snapshot-retention: 5

# Delete snapshot
sudo k3s etcd-snapshot delete <snapshot-name>

# Prune snapshots
sudo k3s etcd-snapshot prune --snapshot-retention 3
```

---

## 26. Networking & CNI (Flannel)

```bash
# k3s default CNI: Flannel (VXLAN)

# Check Flannel pods
kubectl get pods -n kube-flannel
kubectl get pods -A | grep flannel

# Check kube-proxy/kube-router
kubectl get pods -n kube-system | grep proxy

# Get pod CIDR
kubectl get node <name> -o jsonpath='{.spec.podCIDR}'

# CoreDNS pods
kubectl get pods -n kube-system -l k8s-app=kube-dns

# Check DNS from inside a pod
kubectl exec -it <pod> -- nslookup kubernetes.default
kubectl exec -it <pod> -- nslookup <service>.<namespace>.svc.cluster.local

# List all network policies
kubectl get netpol -A

# Traefik IngressController (k3s default)
kubectl get pods -n kube-system | grep traefik
kubectl get svc -n kube-system | grep traefik

# Disable Traefik (add to config.yaml or startup flag)
# disable: traefik

# ServiceLB (Klipper LB — k3s default LoadBalancer)
kubectl get svc -n kube-system | grep svclb
# Disable:
# disable: servicelb
```

---

## 27. Certificates & TLS

```bash
# k3s auto-manages certificates (stored in /var/lib/rancher/k3s/server/tls/)
ls /var/lib/rancher/k3s/server/tls/

# Check certificate expiry
sudo openssl x509 -in /var/lib/rancher/k3s/server/tls/server-ca.crt -noout -dates

# Rotate certificates (k3s 1.22+)
sudo k3s certificate rotate

# Rotate specific certificate
sudo k3s certificate rotate --service kube-apiserver

# List all certs
sudo k3s certificate check

# cert-manager installation (for managing TLS in apps)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

# Check cert-manager
kubectl get pods -n cert-manager

# List certificates
kubectl get certificate -A

# List certificate requests
kubectl get certificaterequest -A

# List issuers
kubectl get issuer -A
kubectl get clusterissuer -A
```

---

## 28. Apply, Diff & Dry-Run

```bash
# Apply manifest
kubectl apply -f file.yaml
kubectl apply -f ./directory/
kubectl apply -f https://url/to/manifest.yaml

# Apply with dry-run (validate only, no changes)
kubectl apply -f file.yaml --dry-run=client
kubectl apply -f file.yaml --dry-run=server   # validates against API server

# Diff against live state
kubectl diff -f file.yaml

# Delete resources from manifest
kubectl delete -f file.yaml

# Apply with prune (delete resources not in manifest)
kubectl apply -f ./dir/ --prune -l app=myapp

# Force apply (replace, not merge)
kubectl replace -f file.yaml
kubectl replace --force -f file.yaml           # delete + recreate

# Generate YAML without applying
kubectl create deploy nginx --image=nginx --dry-run=client -o yaml
kubectl create svc clusterip nginx --tcp=80:80 --dry-run=client -o yaml

# Edit live resource
kubectl edit deploy <name>
kubectl edit cm <name>
kubectl edit svc <name>

# Patch resource (strategic merge)
kubectl patch deploy <name> -p '{"spec":{"replicas":3}}'

# Patch with JSON patch
kubectl patch deploy <name> --type=json \
  -p='[{"op":"replace","path":"/spec/replicas","value":3}]'

# Server-side apply
kubectl apply --server-side -f file.yaml
```

---

## 29. Useful One-Liners

```bash
# Watch all pods across all namespaces
watch kubectl get pods -A

# Get all images running in cluster
kubectl get pods -A -o jsonpath='{range .items[*]}{.spec.containers[*].image}{"\n"}{end}' | sort -u

# Get all pods that are NOT running
kubectl get pods -A --field-selector='status.phase!=Running'

# Get all pods on a specific node
kubectl get pods -A --field-selector=spec.nodeName=<node>

# Delete all completed/failed pods
kubectl delete pods -A --field-selector=status.phase=Succeeded
kubectl delete pods -A --field-selector=status.phase=Failed

# Delete all evicted pods
kubectl get pods -A | grep Evicted | awk '{print $1, $2}' | \
  xargs -n2 bash -c 'kubectl delete pod -n $0 $1'

# Force delete stuck terminating pod
kubectl delete pod <name> --grace-period=0 --force

# Get resource usage sorted by CPU
kubectl top pods -A --sort-by=cpu

# Get resource usage sorted by memory
kubectl top pods -A --sort-by=memory

# List all container images in a namespace
kubectl get pods -n <ns> -o jsonpath='{.items[*].spec.containers[*].image}' | tr ' ' '\n'

# Get pod restart counts
kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[0].restartCount}{"\n"}{end}'

# Find pods with high restart count
kubectl get pods -A | awk '$5 > 5'

# Scale all deployments to 0 in a namespace (maintenance mode)
kubectl scale deploy --all --replicas=0 -n <namespace>

# Restart all deployments in a namespace
kubectl rollout restart deploy -n <namespace>

# Get all resource types in a namespace
kubectl api-resources --verbs=list --namespaced -o name | \
  xargs -I{} kubectl get {} -n <namespace> 2>/dev/null

# Watch events as they happen
kubectl get events -A -w --sort-by='.lastTimestamp'

# Get kubeconfig from k3s and set KUBECONFIG
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Check if a pod can reach a service
kubectl exec -it <pod> -- wget -qO- http://<service>:<port>
kubectl exec -it <pod> -- curl -s http://<service>:<port>

# Base64 encode/decode quickly
echo -n "value" | base64
echo "dmFsdWU=" | base64 --decode

# Apply all YAML files in a directory recursively
kubectl apply -R -f ./manifests/

# Get the cluster CA certificate
kubectl get configmap kube-root-ca.crt -n default -o jsonpath='{.data.ca\.crt}'

# List all non-system namespaces
kubectl get ns | grep -v kube-

# Count pods per node
kubectl get pods -A -o wide | awk '{print $8}' | sort | uniq -c | sort -rn

# Get all services with their selectors
kubectl get svc -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}: {.spec.selector}{"\n"}{end}'

# Get pod logs from all containers in a namespace matching label
kubectl logs -n <ns> -l app=<label> --all-containers=true --prefix=true -f

# Tail logs from crashed pod
kubectl logs <pod> --previous --tail=50
```

---

*Generated: 2026-06-09 | k3s v1.x / kubectl v1.x*
