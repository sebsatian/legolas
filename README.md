# VisionPlay

Demo web de terapia visual construida con `React + Vite`.

## Desarrollo local

```bash
npm install
npm run dev
```

## Despliegue con Docker

Este repo ya quedó preparado para levantarlo como demo en un server local con `docker compose`.

### Archivos usados

- `Dockerfile`: build multi-stage (`node` + `nginx`)
- `docker-compose.yml`: levanta la app en `http://localhost:8080`
- `nginx.conf`: sirve la SPA y resuelve rutas con `index.html`

### Comandos para usar más adelante en el server

```bash
docker compose up -d --build
```

Para ver logs:

```bash
docker compose logs -f
```

## Cloudflare DDNS opcional

El `docker-compose.yml` incluye un servicio `cloudflare-ddns` para actualizar automáticamente el DNS en Cloudflare cuando el ISP cambie tu IP pública.

### 1. Crear tu archivo local de variables

```bash
cp .env.example .env
```

Edita `.env` y pega tu token:

```env
CLOUDFLARE_API_TOKEN=pega_aqui_tu_token
CLOUDFLARE_DDNS_DOMAINS=legolas.cl,www.legolas.cl
CLOUDFLARE_DDNS_PROXIED=true
CLOUDFLARE_DDNS_IP6_PROVIDER=none
```

### 2. Levantar la app + DDNS

```bash
docker compose --profile ddns up -d --build
```

### 3. Revisar que el updater arrancó bien

```bash
docker compose logs -f cloudflare-ddns
```

> El perfil `ddns` es opcional, así que tu despliegue local normal sigue funcionando aunque no tengas el token configurado.

Para bajar la demo:

```bash
docker compose down
```

## Puerto publicado

- App: `8080`
- Healthcheck: `http://localhost:8080/health`

## Notas

- El contenedor queda con `restart: unless-stopped`.
- El build genera archivos estáticos y los sirve con `nginx`.
- Si quieres exponerlo en tu red de casa, abre/redirige el puerto `8080` en el equipo que hará de server.
