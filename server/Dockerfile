FROM node:20-bookworm-slim

WORKDIR /app

# Install Stockfish engine on the VPS.
# Primary: Debian stockfish package (known compatible with this system).
# Bonus: also download Stockfish 19 universal binary from GitHub releases
# as /usr/local/bin/stockfish-19 for when the VPS CPU supports AVX2/AVX-512.
RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish ca-certificates wget tar xz-utils \
    && mkdir -p /usr/games \
    && wget -q https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-linux-x86-64-universal.tar.gz -O /tmp/stockfish.tar.gz || true \
    && tar xzf /tmp/stockfish.tar.gz -C /tmp 2>/dev/null || true \
    && SF_BIN="$(find /tmp -maxdepth 4 -type f -name 'stockfish*' | head -1)" \
    && if [ -n "$SF_BIN" ]; then cp "$SF_BIN" /usr/local/bin/stockfish-19 && chmod +x /usr/local/bin/stockfish-19; fi \
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
