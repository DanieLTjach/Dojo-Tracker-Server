### Deployment instructions

## Server setup

1. Copy your ssh key to the server.
2. Install docker (including docker compose) on the server.
3. Run `scripts/server-setup.sh user@server`. You will be prompted for your SSH key passphrase to login to the server and the Telegram bot token.
4. SSH into the server and run `cd app`.
5. Run `docker compose -f docker-compose-bootstrap.yml up` to obtain HTTPS certificates. Wait until you see log `certbot  | Successfully received certificate.` in the terminal, then stop it with Ctrl+C.
6. The recommended way to deploy the application is by creating a release on Github to trigger the Github Actions release workflow.
7. For manual deployment run `deploy.sh tag` on the server, where tag is the docker image tag to deploy.

## Github actions setup

1. Add `SSH_HOST`, `SSH_USERNAME`, `SSH_PORT` github secrets with the server ssh parameters.
2. Generate an ssh keypair using `ssh-keygen`.
3. Copy the generated public key to server's `.ssh/authorized_keys`.
4. Add `SSH_KEY` github secret using the generated private key.
5. Generate an access token on Docker Hub and add it to `DOCKER_ACCESS_TOKEN `github secret.
6. When you want to deploy the application, create a new github release.

## Prod DB connection

You can use web editor to view and edit prod DB. To do it,
forward remote port 8080 to your local machine: `ssh -L 8080:localhost:8080 user@server`
and then go to `localhost:8080` in browser.