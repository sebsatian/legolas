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
