#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

if [ -z "$1" ]; then
    echo -e "${RED}Error: Server address not provided${NC}"
    echo "Usage: ./server-setup.sh user@server-address"
    exit 1
fi

SERVER=$1

SSH_CONTROL_PATH="/tmp/ssh-control-$USER-$$"
export SSH_OPTS="-o ControlMaster=auto -o ControlPath=$SSH_CONTROL_PATH -o ControlPersist=10m"

cleanup() {
    echo "Cleaning up SSH connection..."
    ssh $SSH_OPTS -O exit $SERVER 2>/dev/null || true
    rm -f "$SSH_CONTROL_PATH" 2>/dev/null || true
}

trap cleanup EXIT

echo -e "${GREEN}Starting server setup for $SERVER${NC}"

echo "Establishing SSH connection..."
ssh $SSH_OPTS -fN $SERVER

echo "Checking if 'app' directory already exists on the server..."
if ssh $SSH_OPTS $SERVER "[ -d app ]"; then
    echo -e "${RED}Error: Directory 'app' already exists on the server${NC}"
    exit 1
fi

echo "Creating 'app' directory on the server..."
ssh $SSH_OPTS $SERVER "mkdir app"

echo "Copying nginx configuration..."
scp $SSH_OPTS -r deploy/nginx $SERVER:~/app/

echo "Copying docker-compose files..."
scp $SSH_OPTS deploy/docker-compose.yml $SERVER:~/app/
scp $SSH_OPTS deploy/docker-compose-bootstrap.yml $SERVER:~/app/

echo "Creating necessary folders..."
ssh $SSH_OPTS $SERVER "mkdir -p app/letsencrypt app/certbot app/db/data"

echo "Copying deploy.sh script..."
scp $SSH_OPTS scripts/deploy.sh $SERVER:~/app/
ssh $SSH_OPTS $SERVER "chmod +x app/deploy.sh"

echo ""
read -p "Enter Telegram Bot Token: " BOT_TOKEN

if [ -z "$BOT_TOKEN" ]; then
    echo -e "${RED}Error: Bot token cannot be empty${NC}"
    exit 1
fi

echo "Generating JWT secret..."
JWT_SECRET=$(openssl rand -base64 32)

echo "Creating .env file on the server..."
ssh $SSH_OPTS $SERVER "cat > app/.env << EOF
NODE_ENV=production
TAG=latest
BOT_TOKEN=$BOT_TOKEN
JWT_SECRET=$JWT_SECRET
EOF"

echo -e "${GREEN}Server setup completed successfully!${NC}"