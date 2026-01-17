FROM node:20-alpine

WORKDIR /app

RUN npm init -y && npm install cors-anywhere

COPY server.js .

EXPOSE 8080

CMD ["node", "server.js"]
