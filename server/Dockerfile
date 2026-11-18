FROM node:20-bookworm-slim

WORKDIR /app

# Install Stockfish 19 universal binary from official GitHub releases.
# Universal binary auto-detects CPU features (AVX2, AVX-512, etc.) for best VPS performance.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tar xz-utils \
    && mkdir -p /usr/games \
    && curl -Lsf https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-linux-x86-64-universal.tar.gz -o /tmp/stockfish.tar.gz \
    && tar xzf /tmp/stockfish.tar.gz -C /tmp \
    && cp $(find /tmp -maxdepth 4 -type f -name 'stockfish*' | head -1) /usr/games/stockfish \
    && chmod +x /usr/games/stockfish \
    && rm -rf /tmp/stockfish.tar.gz /tmp/stockfish-* /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev
COPY index.js ./

ENV PORT=8080
ENV STOCKFISH_BIN=/usr/games/stockfish
EXPOSE 8080
CMD ["node", "index.js"]
