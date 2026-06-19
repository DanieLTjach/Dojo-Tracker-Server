FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY .husky/install.mjs ./.husky/install.mjs

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source code
COPY src ./src
COPY config ./config
COPY tsconfig.json ./tsconfig.json

# Copy database migrations
COPY db/migrations ./db/migrations

# Copy CLI scripts (bulk import etc.) so they can be invoked via docker exec
COPY scripts ./scripts

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
