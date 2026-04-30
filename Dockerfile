FROM node:20-alpine AS development
WORKDIR /app
ENV HUSKY=0
RUN apk add --no-cache yarn
COPY package.json yarn.lock /app/
RUN yarn install --frozen-lockfile
COPY app/ /app/app/
COPY public/ /app/public/
COPY tsconfig.json vite.config.ts react-router.config.ts components.json /app/
EXPOSE 3000 24678
CMD ["yarn", "dev"]

FROM node:20-alpine AS build-env
WORKDIR /app
ENV HUSKY=0
ENV NODE_ENV=production
RUN apk add --no-cache yarn
COPY package.json yarn.lock /app/
RUN yarn install --frozen-lockfile
COPY app/ /app/app/
COPY public/ /app/public/
COPY tsconfig.json vite.config.ts react-router.config.ts components.json /app/
RUN yarn build

FROM node:20-alpine AS production-dependencies-env
WORKDIR /app
RUN apk add --no-cache yarn
COPY package.json yarn.lock /app/
RUN HUSKY=0 yarn install --frozen-lockfile --production

FROM node:20-alpine
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY package.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
RUN chown -R appuser:appgroup /app
USER appuser
CMD ["node_modules/.bin/react-router-serve", "./build/server/index.js"]
