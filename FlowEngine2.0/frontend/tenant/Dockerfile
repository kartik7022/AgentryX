FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-runtime-config.sh /docker-entrypoint.d/40-tenant-runtime-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
