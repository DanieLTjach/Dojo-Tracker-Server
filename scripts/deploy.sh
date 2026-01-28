#!/bin/bash

# Deploy Docker Image Script
# This script pulls the Docker image from Docker Hub and starts the application

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_USERNAME=japandojo
IMAGE_NAME=dojo-tracker-server
TAG="$1"

# Check if TAG is provided
if [ -z "$TAG" ]; then
    echo -e "${RED}Error: TAG parameter is required${NC}"
    echo -e "${YELLOW}Usage: $0 <tag>${NC}"
    echo -e "${YELLOW}Example: $0 v1.0.0${NC}"
    exit 1
fi

FULL_IMAGE_NAME="${DOCKER_USERNAME}/${IMAGE_NAME}:${TAG}"

echo -e "${GREEN}=== Deploying Dojo Tracker Server ===${NC}"
echo -e "${YELLOW}Image: ${FULL_IMAGE_NAME}${NC}\n"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found in deploy directory${NC}"
    echo -e "${RED}Please create a .env file with required configuration before deploying${NC}"
    exit 1
fi

# Update TAG in .env file with current value from environment
sed -i.bak "s/^TAG=.*/TAG=${TAG}/" .env
echo -e "${GREEN}Updated TAG=${TAG} in .env file${NC}\n"

# Pull the image
echo -e "${GREEN}Step 1: Pulling image from Docker Hub...${NC}"
docker pull "${FULL_IMAGE_NAME}"
echo -e "${GREEN}✓ Image pulled successfully${NC}\n"

# Stop existing containers
echo -e "${GREEN}Step 2: Stopping existing containers...${NC}"
docker compose down

echo -e "${GREEN}✓ Containers stopped${NC}\n"

# Start the application
echo -e "${GREEN}Step 3: Starting application...${NC}"
docker compose up -d
echo -e "${GREEN}✓ Application started${NC}\n"

# Wait for the main service to become healthy
echo -e "${YELLOW}Step 4: Waiting for service to become healthy...${NC}"
RETRY_COUNT=0
MAX_RETRIES=10
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker compose ps dojo-tracker-app | grep -q "healthy"; then
        echo -e "${GREEN}✓ Service is healthy${NC}\n"
        break
    fi
    
    echo "Service is not healthy yet... waiting (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)"
    sleep 10
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "\n${RED}Error: Service did not become healthy within expected time${NC}"
    echo -e "${RED}Check logs with: docker compose logs dojo-tracker-app${NC}\n"
    exit 1
fi

# Show container status
echo -e "${BLUE}=== Container Status ===${NC}"
docker compose ps

echo -e "\n${GREEN}=== Deployment Complete! ===${NC}"
echo -e "${YELLOW}View logs with: docker compose logs -f${NC}"
echo -e "${YELLOW}Stop application: docker compose down${NC}"
echo -e "${YELLOW}Restart application: docker compose restart${NC}"
