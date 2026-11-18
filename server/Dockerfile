FROM node:20-bookworm-slim

WORKDIR /app

# Use the latest Stockfish 19 universal binary from official GitHub releases.
# Universal binary auto-detects CPU features (AVX2, AVX-512, etc.) for best
# performance on the VPS. The relay reports stockfish:true only after a real
# `uci` / `isready` handshake succeeds.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget tar \
    && wget -q https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-linux-x86-64-universal.tar.gz \
    && tar xzf stockfish-linux-x86-64-universal.tar.gz \
    && SF_BIN="$(find . -maxdepth 3 -name 'stockfish*' -type f -executable | head -1)" \
    && cp "$SF_BIN" /usr/games/stockfish \
    && chmod +x /usr/games/stockfish \
    && rm -rf stockfish-linux-x86-64-universal.tar.gz stockfish-* \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev
COPY index.js ./

ENV PORT=8080
ENV STOCKFISH_BIN=/usr/games/stockfish
EXPOSE 8080
CMD ["node", "index.js"]
