FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production=false
COPY . .
EXPOSE 3002
CMD ["npx", "tsx", "src/index.ts"]
