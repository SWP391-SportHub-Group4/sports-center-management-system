FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Hiện bảng điền nhanh tài khoản demo trên trang đăng nhập (chỉ dùng cho môi trường dev/demo).
ARG NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false
ENV NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=$NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
