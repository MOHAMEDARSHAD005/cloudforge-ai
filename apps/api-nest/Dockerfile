FROM node:26-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./

COPY packages/ packages/
COPY apps/api-nest/ apps/api-nest/

RUN npm ci

RUN npm run build --workspace=@cloudforge/shared-types
RUN npm run build --workspace=@cloudforge/shared-config

EXPOSE 3000

CMD ["npm", "run", "dev", "--workspace=@cloudforge/api-nest"]
