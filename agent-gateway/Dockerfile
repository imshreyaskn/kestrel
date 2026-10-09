FROM node:22-bookworm-slim

WORKDIR /app

# Install dependencies with ignore-scripts as recommended by Pi docs
COPY package.json ./
RUN npm install --ignore-scripts --registry=https://registry.npmmirror.com

COPY tsconfig.json ./
COPY src/ ./src/

EXPOSE 8010

CMD ["npm", "run", "dev"]
