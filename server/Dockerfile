FROM node:20-bookworm-slim

WORKDIR /app

# Install Stockfish engine (Debian package - known compatible)
# Plus Stockfish 19 from GitHub as bonus (AVX2/AVX-512 auto-detect)
RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish ca-certificates wget tar xz-utils \
    && mkdir -p /usr/games /usr/local/bin \
    && wget -q https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-linux-x86-64-universal.tar.gz -O /tmp/stockfish.tar.gz 2>/dev/null || true \
    && tar xzf /tmp/stockfish.tar.gz -C /tmp 2>/dev/null || true \
    && SF_BIN="$(find /tmp -maxdepth 4 -type f -name 'stockfish*' | head -1)" \
    && if [ -n "$SF_BIN" ]; then cp "$SF_BIN" /usr/local/bin/stockfish-19 && chmod +x /usr/local/bin/stockfish-19; fi \
    && rm -f /tmp/stockfish.tar.gz \
    && rm -rf /tmp/stockfish-* \
    && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/index.js ./

ENV PORT=8080
ENV STOCKFISH_BIN=/usr/games/stockfish
EXPOSE 8080
CMD ["node", "index.js"]
