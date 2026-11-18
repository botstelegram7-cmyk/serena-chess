FROM node:20-bookworm-slim

WORKDIR /app

# Install Stockfish 19 universal binary from official GitHub releases.
# Universal binary auto-detects CPU features (AVX2, AVX-512, etc.) for best VPS performance.
RUN set -euxo pipefail \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget tar xz-utils \
    && mkdir -p /usr/games \
    && wget -q https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-linux-x86-64-universal.tar.gz -O /tmp/stockfish.tar.gz \
    && tar xzf /tmp/stockfish.tar.gz -C /tmp \
    && SF_BIN="$(find /tmp -maxdepth 4 -type f -executable -name 'stockfish*' | head -1)" \
    && echo "Found Stockfish binary: $SF_BIN" \
    && test -n "$SF_BIN" \
    && cp "$SF_BIN" /usr/games/stockfish \
    && chmod +x /usr/games/stockfish \
    && /usr/games/stockfish --help >/dev/null 2>&1 || /usr/games/stockfish >/dev/null 2>&1 || true \
    && rm -f /tmp/stockfish.tar.gz \
    && rm -rf /tmp/stockfish-* \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev
COPY index.js ./

ENV PORT=8080
ENV STOCKFISH_BIN=/usr/games/stockfish
EXPOSE 8080
CMD ["node", "index.js"]
