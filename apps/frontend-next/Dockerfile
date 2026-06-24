FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./

COPY packages/ packages/
COPY apps/frontend-next/ apps/frontend-next/

RUN npm ci

RUN npm run build --workspace=@cloudforge/shared-types
RUN npm run build --workspace=@cloudforge/shared-config

EXPOSE 3001

CMD ["npm", "run", "dev", "--workspace=@cloudforge/frontend-next"]
