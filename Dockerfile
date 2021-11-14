FROM alpine

WORKDIR /usr/src/app

RUN apk add borgbackup openssh-client nodejs npm mongodb-tools

COPY ./package.json ./
COPY ./package-lock.json ./
RUN npm install
COPY ./tsconfig.json ./
COPY ./src ./src
RUN npm run build

ENTRYPOINT [ "npm", "start" , "--"]
