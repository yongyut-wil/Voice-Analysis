FROM node:20-alpine AS build-env
COPY package.json yarn.lock /app/
WORKDIR /app
ENV HUSKY=0
ENV NODE_ENV=development
RUN corepack enable && yarn install --frozen-lockfile
COPY . /app/
RUN yarn build

FROM node:20-alpine AS production-dependencies-env
COPY package.json yarn.lock /app/
WORKDIR /app
RUN corepack enable && HUSKY=0 yarn install --frozen-lockfile --production

FROM node:20-alpine
ENV NODE_ENV=production
COPY package.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
CMD ["node_modules/.bin/react-router-serve", "./build/server/index.js"]