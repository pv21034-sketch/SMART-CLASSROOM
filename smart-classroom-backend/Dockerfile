
# ============================================
# SMART CLASSROOM - BACKEND RUST
# Dockerfile para Render
# ============================================

# ETAPA 1: Compilación
FROM rust:1-bookworm AS builder

WORKDIR /app

# Dependencias necesarias para compilar
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiar el proyecto
COPY . .

# Compilar el servidor en modo release
RUN cargo build --release --bin smart_classroom_backend

# ETAPA 2: Ejecución
FROM debian:bookworm-slim

WORKDIR /app

# Certificados para conexiones HTTPS/TLS
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copiar el ejecutable compilado
COPY --from=builder \
    /app/target/release/smart_classroom_backend \
    /app/smart_classroom_backend

# Puerto del servidor
ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=10000

# Evitar ejecutar migraciones automáticamente
ENV RUN_MIGRATIONS=false

EXPOSE 10000

# Iniciar SMART CLASSROOM
CMD ["/app/smart_classroom_backend"]
