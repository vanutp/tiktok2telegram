FROM node:20-slim

WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN yarn

COPY . .
RUN yarn build
ENV NODE_ENV production
USER node
CMD yarn start
