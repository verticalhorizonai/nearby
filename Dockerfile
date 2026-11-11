# Nearby in one container: the Fastify API serves /api and the built React client (spec 3.1, 3.13).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3000
# At every start the container seeds the sample data (idempotent: it never duplicates) and then npm start applies the
# schema (from the app's own copy) and listens on $PORT (Railway sets it) or 3000. Ruling 31.
CMD ["sh", "-c", "npm run seed && npm start"]
