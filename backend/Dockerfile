FROM node:20-alpine

RUN apk add --no-cache bash util-linux python3 make g++ python3-dev linux-headers

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install 2>/dev/null || npm install

COPY . .
RUN chmod +x /app/startbash.sh /app/startclaude.sh

EXPOSE 4001
ENV PORT=4001
ENV NODE_ENV=production

CMD ["node", "src/index.js"]
