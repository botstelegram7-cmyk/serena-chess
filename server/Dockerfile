FROM node:20-bookworm-slim

WORKDIR /app

# Install Stockfish engine on the VPS / Render.
# Primary: Stockfish 19 universal binary from GitHub releases (AVX2/AVX-512 auto-detect).
# Fallback: Debian stockfish package (known compatible on most Linux systems).
RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish ca-certificates wget tar xz-utils \
    && mkdir -p /usr/games /usr/local/bin \
    && echo "=== Downloading Stockfish 19 from GitHub ===" \
    && wget -q https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-linux-x86-64-universal.tar.gz -O /tmp/stockfish.tar.gz || true \
    && echo "=== Extracting Stockfish 19 ===" \
    && tar xzf /tmp/stockfish.tar.gz -C /tmp 2>/dev/null || true \
    && SF_BIN="$(find /tmp -maxdepth 4 -type f -name 'stockfish*' | head -1)" \
    && echo "=== Found Stockfish 19: $SF_BIN ===" \
    && if [ -n "$SF_BIN" ]; then cp "$SF_BIN" /usr/local/bin/stockfish && chmod +x /usr/local/bin/stockfish; fi \
    && echo "=== Debian stockfish at: $(which stockfish || echo 'not found') ===" \
    && rm -f /tmp/stockfish.tar.gz \
    && rm -rf /tmp/stockfish-* \
    && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/index.js ./

ENV PORT=8080
ENV STOCKFISH_BIN=/usr/local/bin/stockfish
EXPOSE 8080
CMD ["node", "index.js"]
