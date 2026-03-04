# Record Store API

NestJS REST API for managing a vinyl/CD/cassette record store. Supports inventory management, order placement with transactional stock decrement, full-text search, cursor-based pagination, and MusicBrainz tracklist integration.

## Prerequisites

- **Node.js** >= 20 (optional, via docker)
- **MongoDB** >= 5 (replica set required for transactions). Optional, via Docker.
- **Docker & Docker Compose** 

## Quick Start

### Docker (recommended)

```bash
npm run docker:up
```

Starts MongoDB (replica set), initializes the replica, and builds/runs the API. The app is available at `http://localhost:3000`.

Seed the database:

```bash
npm run setup:db
```

### Local Development (without Docker)

Requires a running MongoDB replica set.

```bash
cp .env.sample .env          # set MONGO_URL
npm install
npm run setup:db             # seed data from data.json
npm run start:dev
```

#### Environment Variables

| Variable    | Required | Default | Notes                                              |
|-------------|----------|---------|----------------------------------------------------|
| `MONGO_URL` | Yes      | —       | Must point to a replica set (transactions require it) |
| `PORT`      | No       | `3000`  | HTTP listen port                                   |

## API

Swagger UI is available at `http://localhost:3000/swagger` when the app is running.

## Scripts

| Script         | Description                           |
|----------------|---------------------------------------|
| `docker:up`    | Start all services via Docker Compose |
| `start:dev`    | Dev server with hot reload            |
| `start:prod`   | Run compiled app from `dist/`         |
| `setup:db`     | Seed database from `data.json`        |
| `test`         | Unit + integration tests              |
| `test:e2e`     | End-to-end tests                      |
| `test:cov`     | Unit + integration tests with coverage|
| `lint`         | ESLint with auto-fix                  |
