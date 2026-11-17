FROM node:20-bookworm-slim

WORKDIR /app

# Use Debian's native UCI engine on the VPS. The relay reports
# stockfish:true only after a real `uci` / `isready` handshake succeeds.
RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev
COPY index.js ./

ENV PORT=8080
ENV STOCKFISH_BIN=/usr/games/stockfish
EXPOSE 8080
CMD ["node", "index.js"]
