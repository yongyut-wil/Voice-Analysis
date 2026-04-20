FROM node:20-alpine AS build-env
COPY . /app
WORKDIR /app
ENV HUSKY=0
RUN corepack enable && yarn install --frozen-lockfile
RUN echo "=== .bin contents ===" && ls node_modules/.bin/ | grep -i react || echo "NO REACT BINARIES"
RUN echo "=== @react-router/dev ===" && ls node_modules/@react-router/ || echo "NOT FOUND"
RUN yarn build

FROM node:20-alpine AS production-dependencies-env
COPY ./package.json yarn.lock /app/
WORKDIR /app
RUN corepack enable && HUSKY=0 yarn install --frozen-lockfile --production

FROM node:20-alpine
COPY ./package.json yarn.lock /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
CMD ["yarn", "start"]