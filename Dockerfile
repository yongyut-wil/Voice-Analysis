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
RUN NODE_ENV=development corepack enable && \
    NODE_ENV=development yarn install --frozen-lockfile
COPY app/ /app/app/
COPY public/ /app/public/
COPY tsconfig.json vite.config.ts react-router.config.ts components.json /app/
RUN NODE_ENV=production yarn build

FROM node:20-alpine
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY package.json /app/
# ✅ copy node_modules จาก build-env โดยตรง ไม่ต้องติดตั้งใหม่
COPY --from=build-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
RUN chown -R appuser:appgroup /app
USER appuser
CMD ["node_modules/.bin/react-router-serve", "./build/server/index.js"]