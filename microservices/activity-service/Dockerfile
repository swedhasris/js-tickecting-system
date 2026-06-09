FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json ./
RUN npm install --production=false
COPY . .
EXPOSE 3003
CMD ["npx", "tsx", "src/index.ts"]
