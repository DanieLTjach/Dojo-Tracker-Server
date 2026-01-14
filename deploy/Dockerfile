FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy source code
COPY src ./src
COPY config ./config
COPY tsconfig.json ./tsconfig.json

# Copy database migrations
COPY db/migrations ./db/migrations

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
