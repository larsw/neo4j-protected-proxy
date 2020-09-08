FROM node:14-alpine

LABEL maintainer="Lars Wilhelmsen <lars@sral.org>"

WORKDIR /app
COPY package.json package-lock.json tsconfig.json /app/

COPY app.ts /app/

RUN npm install --no-optional && npm cache clean --force && npx tsc
EXPOSE 3000
CMD ["node", "dist/app.js"]
