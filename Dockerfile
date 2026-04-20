FROM node:20-alpine AS build-env
# copy เฉพาะ dependency files ก่อน (ไม่มี node_modules ติดมา)
COPY package.json yarn.lock /app/
WORKDIR /app
RUN corepack enable && HUSKY=0 yarn install --frozen-lockfile
# จากนั้นค่อย copy source code
COPY . /app/
RUN yarn build

FROM node:20-alpine AS production-dependencies-env
COPY package.json yarn.lock /app/
WORKDIR /app
RUN corepack enable && HUSKY=0 yarn install --frozen-lockfile --production

FROM node:20-alpine
COPY package.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
CMD ["node_modules/.bin/react-router-serve", "./build/server/index.js"]