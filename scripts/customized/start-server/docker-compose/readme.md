# Run `make build.app` in root folder

# Run the following script to export the selected local image, scp to remote desired server, then install docker to that server:
docker save cybernetics:release.2026-05-14T14-54-58Z.1 | ssh Micro-server docker load

- After that, update the docker-compose.yaml to consume the new image