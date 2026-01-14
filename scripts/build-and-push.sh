#!/bin/bash

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
DOCKER_USERNAME=japandojo
IMAGE_NAME=dojo-tracker-server
PLATFORM=${PLATFORM:-linux/amd64}  # Default to x86_64, can be overridden

# Validate required environment variables
if [ -z "$TAG" ]; then
    echo -e "${RED}Error: TAG environment variable is not set${NC}"
    echo -e "${YELLOW}Usage: TAG=v1.0.0 DOCKER_ACCESS_TOKEN=your_token ./build-and-push.sh${NC}"
    exit 1
fi

if [ -z "$DOCKER_ACCESS_TOKEN" ]; then
    echo -e "${RED}Error: DOCKER_ACCESS_TOKEN environment variable is not set${NC}"
    echo -e "${YELLOW}Usage: TAG=v1.0.0 DOCKER_ACCESS_TOKEN=your_token ./build-and-push.sh${NC}"
    exit 1
fi

FULL_IMAGE_NAME="${DOCKER_USERNAME}/${IMAGE_NAME}:${TAG}"

echo -e "${GREEN}=== Building and Pushing Docker Image ===${NC}"
echo -e "${YELLOW}Image: ${FULL_IMAGE_NAME}${NC}"
echo -e "${YELLOW}Platform: ${PLATFORM}${NC}\n"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Build the Docker image
echo -e "${GREEN}Step 1: Building Docker image...${NC}"
docker build --platform "${PLATFORM}" -f deploy/Dockerfile -t "${FULL_IMAGE_NAME}" .

echo -e "${GREEN}✓ Image built successfully${NC}\n"

# Login to Docker Hub
echo -e "${GREEN}Step 2: Logging in to Docker Hub...${NC}"
echo "$DOCKER_ACCESS_TOKEN" | docker login -u "$DOCKER_USERNAME" --password-stdin

echo -e "${GREEN}✓ Logged in successfully${NC}\n"

# Push the image
echo -e "${GREEN}Step 3: Pushing image to Docker Hub...${NC}"
docker push "${FULL_IMAGE_NAME}"

echo -e "${GREEN}✓ Image pushed successfully${NC}\n"

echo -e "${GREEN}=== Build and Push Complete! ===${NC}"
echo -e "${YELLOW}Image available at: ${FULL_IMAGE_NAME}${NC}"
