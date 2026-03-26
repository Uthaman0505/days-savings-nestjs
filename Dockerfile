# ----------- BUILDER -----------
    FROM node:22-bookworm-slim AS builder

    WORKDIR /app
    
    COPY package.json yarn.lock ./
    
    # ✅ Fix registry + network issues
    RUN yarn config set registry https://registry.npmjs.org/ \
      && yarn cache clean \
      && yarn install --frozen-lockfile --network-timeout 100000
    
    COPY nest-cli.json tsconfig.json tsconfig.build.json ./
    COPY src ./src
    
    RUN yarn build
    
    
    # ----------- RUNNER -----------
    FROM node:22-bookworm-slim AS runner
    
    WORKDIR /app
    
    ENV NODE_ENV=production
    ENV APP_PORT=5000
    
    COPY package.json yarn.lock ./
    
    # ✅ Same fix here
    RUN yarn config set registry https://registry.npmjs.org/ \
      && yarn cache clean \
      && yarn install --frozen-lockfile --production --network-timeout 100000
    
    COPY --from=builder /app/dist ./dist
    
    EXPOSE 5000
    
    CMD ["node", "dist/main.js"]