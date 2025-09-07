FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Create recordings directory
RUN mkdir -p recordings

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]