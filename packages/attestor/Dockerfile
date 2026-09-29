# Attestation enclave image (Phala dstack / any TDX-capable host).
# Build from the repository root:  docker build -f packages/attestor/Dockerfile -t hajj-attestor .
FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/solvency-model packages/solvency-model
COPY packages/prover packages/prover
COPY packages/attestor packages/attestor
COPY circuits/hajj_solvency/target circuits/hajj_solvency/target
COPY data/synthetic data/synthetic
COPY scripts/setup-crs.sh scripts/setup-crs.sh

RUN pnpm install --frozen-lockfile --filter @hajj-zk/attestor... \
 && apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && bash scripts/setup-crs.sh \
 && rm -rf /var/lib/apt/lists/*

ENV PORT=8787
EXPOSE 8787
CMD ["pnpm", "--filter", "@hajj-zk/attestor", "start"]
