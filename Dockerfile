FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4173
ENV DATA_DIR=/app/data

COPY package.json ./
COPY index.html app.js styles.css quick-note.html quick-note.css quick-note.js pointeuse.html pointeuse.css pointeuse.js server.js manifest.webmanifest service-worker.js icon.svg qr-assistant-xavier.jpg qr-pointeuse.jpg ./

RUN mkdir -p /app/data

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
