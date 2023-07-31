FROM alpine/k8s:1.27.4

WORKDIR /app

RUN apk add borgbackup openssh-client nodejs npm mongodb-tools


COPY ./package.json ./
COPY ./package-lock.json ./
RUN npm ci
COPY ./tsconfig.json ./
COPY ./src ./src
RUN npm run build

ENTRYPOINT [ "npm", "start" , "--"]
