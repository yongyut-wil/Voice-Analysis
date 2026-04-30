FROM node:20-alpine AS development
WORKDIR /app
ENV HUSKY=0
ENV NODE_ENV=development
COPY package.json yarn.lock /app/
RUN corepack enable && yarn install --frozen-lockfile
COPY app/ /app/app/
COPY public/ /app/public/
COPY tsconfig.json vite.config.ts react-router.config.ts components.json /app/
EXPOSE 3000 24678
CMD ["yarn", "dev"]

FROM node:20-alpine AS build-env
WORKDIR /app
ENV HUSKY=0
ENV NODE_ENV=development
COPY package.json yarn.lock /app/

# 🔍 แยกเป็น 3 RUN เพื่อดูว่าขั้นตอนไหน fail จริงๆ
RUN echo "=== Step 1: node version ===" && node --version && npm --version
RUN echo "=== Step 2: corepack enable ===" && corepack enable && echo "corepack OK"
RUN echo "=== Step 3: yarn install ===" && \
    NODE_ENV=development HUSKY=0 yarn install --frozen-lockfile 2>&1 | tee /tmp/yarn.log || \
    (cat /tmp/yarn.log && exit 1)

COPY app/ /app/app/
COPY public/ /app/public/
COPY tsconfig.json vite.config.ts react-router.config.ts components.json /app/
RUN NODE_ENV=production yarn build

FROM node:20-alpine
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY package.json /app/
COPY --from=build-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
RUN chown -R appuser:appgroup /app
USER appuser
CMD ["node_modules/.bin/react-router-serve", "./build/server/index.js"]