FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY . .

EXPOSE 4001
ENV PORT=4001
ENV NODE_ENV=production

CMD ["node", "src/index.js"]
