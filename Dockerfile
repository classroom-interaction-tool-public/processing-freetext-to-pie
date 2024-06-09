FROM node:16
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install
RUN npm run build

EXPOSE 3000
ENV MONGODB_URI=mongodb://localhost:30000/citdb

CMD ["node", "dist/index.js"]