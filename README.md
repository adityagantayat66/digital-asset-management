# Digital Asset Management (DAM) Platform

An enterprise-grade, microservice-based **Digital Asset Management (DAM)** platform engineered for high-volume media ingestion, direct S3 upload presigning, automated background video transcoding and image processing, real-time SSE progress streaming, fault-tolerant Dead Letter Queue (DLQ) recovery, and real-time operational analytics.

---

## 🏗️ System Architecture

The platform operates on a high-throughput microservices architecture deployed across containerized services. Heavy processing work is isolated into stateless worker pools, guaranteeing that the HTTP API Gateway remains non-blocking and responsive.

```
+---------------------------------------------------------------------------------------------------+
|                                      ENTERPRISE INFRASTRUCTURE                                    |
|                                                                                                   |
|                                     +-----------------------+                                     |
|                                     |  Nginx Reverse Proxy  | (Port 8080 Ingress & Layer 1 Limit) |
|                                     +-----------+-----------+                                     |
|                                                 |                                                 |
|                           +---------------------+---------------------+                           |
|                           |                                           |                           |
|                           v                                           v                           |
|                +----------------------+                    +----------------------+               |
|                | Frontend Web Bundle  |                    |     API Gateway      |               |
|                | (React / Vite App)   |                    |   (Node.js/Express)  |               |
|                +----------------------+                    +----------+-----------+               |
|                                                                       |                           |
|                                                                       v                           |
|                                                            +----------------------+               |
|                                                            |    Queue Broker      |               |
|                                                            |  (RabbitMQ + DLX)    |               |
|                                                            +----------+-----------+               |
|                                                                       |                           |
|                                                                       v                           |
|                                                            +----------------------+               |
|                                                            | Stateless Worker Pool|               |
|                                                            |   (FFmpeg / Sharp)   |               |
|                                                            +----------+-----------+               |
|                                                                       |                           |
|           +-----------------------------------------------------------+                           |
|           |                                                                                       |
|           v                                                                                       |
|  +---------------------------------------------------------------------------------------------+  |
|  |                                         DATA LAYER                                          |  |
|  |  +--------------------------+   +------------------------+   +---------------------------+  |  |
|  |  |   PostgreSQL Database    |   | Redis In-Memory Store  |   |    MinIO Object Storage   |  |  |
|  |  | (Metadata, Users, Tags)  |   | (Cache, PubSub, Locks) |   | (raw & processed buckets) |  |  |
|  |  +--------------------------+   +------------------------+   +---------------------------+  |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## ✨ Key Architectural Features

* **Direct S3 Presigned Uploads**: Generates S3 presigned PUT URLs for direct client-to-MinIO file transfers into the `raw-assets` bucket. Large multi-megabyte payloads bypass API memory and network bandwidth bottlenecks entirely.
* **Asynchronous Media Transcoding**: Offloads image optimization (Sharp 300x300 WebP thumbnails) and video multi-rendition transcoding (FFmpeg 720p H.264 / 1080p H.264) to background workers via RabbitMQ (`asset_processing`), keeping HTTP response times under **50ms**.
* **Dual-Bucket Storage Strategy**: Master source files remain untouched in the private `raw-assets` bucket, while derived thumbnails and resolution streams are stored in `processed-assets`. Workers write outputs back to MinIO to ensure 100% stateless scaling.
* **Real-Time Progress Streaming (SSE + Redis Pub/Sub)**: Streams non-blocking progress updates (`0%` to `100%`) from worker nodes to the client UI using Server-Sent Events (SSE) backed by Redis Pub/Sub, eliminating HTTP polling overhead.
* **Dead Letter Queue (DLQ) & Fault Recovery**: Unprocessable media files or worker crashes are safely routed to RabbitMQ's Dead Letter Exchange (`asset_processing_dlx`) and DLQ (`asset_processing_dead_letters`). The Admin Console provides real-time DLQ depth tracking, 1-click DB sync, and job requeue controls.
* **5-Pillar Redis Performance Strategy**:
  1. **Analytics Counters**: Atomic `INCR asset:{id}:downloads` and `analytics:total_downloads`.
  2. **Leaderboards**: Redis Sorted Sets (`ZSET analytics:top_downloads`) for instant top-download ranking.
  3. **Gallery Query Caching**: High-speed caching (`cache:gallery:*`, 60s TTL) with automatic cache invalidation upon task completion or deletion.
  4. **Live SSE Progress Bus**: Zero-disk Pub/Sub channel (`asset:progress:{id}`) streaming live worker percentage progress to clients.
  5. **Distributed Locks & Rate-Limiting**: Atomic `SET NX EX` locks preventing duplicate worker processing across `--scale worker=N` instances, plus sliding-window upload rate limiting.
* **Automated Stale Upload Cleanup (Node-Cron & Redis Distributed Lock)**: Background workers execute a daily scheduled cron task (`node-cron`, `0 0 * * *`) that purges abandoned `PENDING_UPLOAD` assets older than 6 hours from both MinIO `raw-assets` and PostgreSQL. Uses Redis atomic distributed locking (`SET lock:cron:stale_cleanup true NX EX 3600`) to guarantee single-worker execution across scaled container clusters, recording execution telemetry (`cron:last_executed`) for the Admin Console.
* **2-Layer Defense-in-Depth Security**:
  * **Layer 1 (Nginx Ingress)**: Drops DDoS floods and aggressive scrapers in < 0.1ms at the network perimeter (`limit_req_zone`).
  * **Layer 2 (API Gateway)**: Enforces JWT authentication, user role permissions (`USER` vs `ADMIN`), and database upload quotas.

---

## 🛠️ Technology Stack

| Component | Technology | Description / Responsibilities |
| :--- | :--- | :--- |
| **Ingress & Proxy** | Nginx | Static SPA hosting, reverse proxying, SSL termination, Layer 1 IP rate limiting. |
| **Frontend Web App** | React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons | Responsive UI, dual-stage upload progress modal, media gallery, video player, admin dashboard. |
| **API Gateway** | Node.js, Express, TypeScript, Prisma ORM | Presigned URL generation, metadata DB management, SSE streaming, admin operational endpoints. |
| **Worker Service** | Node.js, TypeScript, `amqplib`, FFmpeg, Sharp, `node-cron` | Consumes RabbitMQ tasks, resizes images, transcodes videos, streams SSE progress via Redis, runs scheduled stale upload cleanup. |
| **Object Storage** | MinIO (S3 Compatible) | Hosts `raw-assets` (master files) and `processed-assets` (thumbnails & video streams). |
| **Message Broker** | RabbitMQ (AMQP) | Reliable task queuing with Dead Letter Exchange (`DLX`) and Dead Letter Queue (`DLQ`). |
| **In-Memory Store** | Redis 7 | Caching layer, real-time SSE Pub/Sub bus, download leaderboards, distributed job locks. |
| **Database** | PostgreSQL 15 (Alpine) | Persistent metadata store for assets, users, taxonomy tags, and failure states. |
| **Orchestration** | Docker Compose & Docker Swarm | Fully containerized environment supporting single-node compose and multi-node swarm stacks. |

---

## 📁 Repository Structure

```
digital-access-management/
├── backend/                  # Node.js + Express + Prisma API Gateway
│   ├── prisma/               # Database Schema & Migrations
│   │   └── schema.prisma     # Models: User, Asset, Tag, AssetTag, AssetStatus
│   ├── src/
│   │   ├── api-services/     # Core Business Logic (assets, auth, admin)
│   │   ├── config/           # Environment Variable Validation (Zod)
│   │   ├── controllers/      # HTTP Request Handlers
│   │   ├── middleware/       # JWT Auth & Role-Based Access Control
│   │   ├── routes/           # REST API Route Declarations
│   │   ├── services/         # Clients for Prisma, Redis, RabbitMQ, MinIO
│   │   └── index.ts          # Express Server Entry Point
│   ├── Dockerfile
│   └── package.json
├── worker/                   # Stateless Background Processing Microservice
│   ├── src/
│   │   ├── background-jobs/  # Image Resizer & Video Transcoder Handlers
│   │   ├── config/           # Worker Configuration
│   │   ├── services/         # Redis, MinIO, RabbitMQ Clients
│   │   └── index.ts          # AMQP Consumer Engine
│   └── Dockerfile
├── frontend/                 # React + Vite + Tailwind CSS Single Page App
│   ├── src/
│   │   ├── components/       # Asset Cards, Upload Modals, Admin Widgets
│   │   │   └── admin/        # Worker Health, Metrics Grid, Failed Assets Table
│   │   ├── context/          # Auth Context & State Management
│   │   ├── pages/            # Login, Register, Gallery Dashboard, Admin Console
│   │   ├── services/         # Axios API Client & SSE Event Source Handlers
│   │   └── types/            # Strict TypeScript Interface Definitions
│   └── Dockerfile
├── nginx/                    # Nginx Reverse Proxy Container Configuration
│   ├── nginx.conf            # Proxy rules, rate-limiting & SPA routing
│   └── Dockerfile
├── docker-compose.yml        # Multi-Container Orchestration Manifest
└── README.md                 # Project Overview & System Documentation
```

---

## 📡 API Endpoints Reference

### 🔐 Authentication (`/api/auth`)
* `POST /api/auth/register` — Register new user account.
* `POST /api/auth/login` — Authenticate user and receive JWT bearer token.
* `GET /api/auth/me` — Fetch authenticated user profile.

### 📦 Assets (`/api/assets`)
* `POST /api/assets/presigned-url` — Request S3 presigned PUT URL for direct MinIO upload.
* `POST /api/assets/confirm` — Finalize upload, register DB asset, and trigger RabbitMQ worker job.
* `GET /api/assets` — Retrieve paginated asset gallery with search and tag filtering.
* `GET /api/assets/:id` — Fetch detailed asset metadata.
* `GET /api/assets/:id/download` — Increment download counters/leaderboards and return presigned GET URL.
* `GET /api/assets/:id/progress/stream` — Real-time SSE stream for worker transcoding progress updates.

### 🛡️ Admin Console (`/api/admin`) *(Admin Role Required)*
* `GET /api/admin/metrics` — Aggregate system health, total assets, storage volume, and download counts.
* `GET /api/admin/top-stats` — Top downloaded assets leaderboard and storage memory usage.
* `GET /api/admin/failed-assets` — List all failed asset processing jobs in PostgreSQL.
* `POST /api/admin/requeue-failed-asset` — Reset asset status to `QUEUED` and republish to RabbitMQ.
* `DELETE /api/admin/failed-assets/:id` — Purge failed asset record from DB and MinIO object storage.
* `GET /api/admin/sync-dlq` — Read dead-lettered RabbitMQ messages and update DB statuses to `FAILED`.
* `GET /api/admin/purge-dlq` — Purge unacknowledged dead-lettered messages from RabbitMQ DLQ.

---

## 🗄️ Database Schema & Models

```prisma
enum Role {
  USER
  ADMIN
}

enum AssetStatus {
  PENDING_UPLOAD
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String
  role         Role     @default(USER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  assets       Asset[]
}

model Asset {
  id                 String      @id @default(uuid())
  originalName       String
  mimeType           String
  size               Int
  rawPath            String
  thumbnailUrl       String?
  transcodedSdUrl    String?
  transcoded720pUrl  String?
  transcoded1080pUrl String?
  status             AssetStatus @default(PENDING_UPLOAD)
  errorMessage       String?
  downloadCount      Int         @default(0)
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt
  uploaderId         String
  uploader           User        @relation(fields: [uploaderId], references: [id], onDelete: Cascade)
  tags               AssetTag[]
}
```

---

## 🚀 Deployment & Operations

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with Docker Compose v2)

---

### 1. Launching Local Infrastructure (Docker Compose)

```bash
# 1. Copy environment variable template
cp .env.example .env

# 2. Build container images and launch cluster in detached mode
docker compose up -d --build

# 3. View live container logs across all microservices
docker compose logs -f
```

---

### 2. Horizontally Scaling Workers

To scale media background transcoding throughput dynamically:

```bash
# Scale background worker instances to 5 parallel containers
docker compose up -d --scale worker=5
```

---

### 3. Production Cluster Deployment (Docker Swarm)

```bash
# 1. Initialize Docker Swarm cluster
docker swarm init

# 2. Build local container images
docker compose build

# 3. Deploy platform stack to Swarm
docker stack deploy -c docker-compose.yml dam

# 4. Scale workers in Swarm cluster
docker service scale dam_worker=5

# 5. Force update frontend or service tasks without downtime
docker service update --force dam_frontend

# 6. View running Swarm service tasks
docker stack services dam

# 7. Tear down stack
docker stack rm dam
```

---

## 🌐 Service Ports & Access Dashboards

| Service | Address / URL | Description | Default Dev Credentials |
| :--- | :--- | :--- | :--- |
| **Nginx Ingress / Frontend SPA** | `http://localhost:8080` | Production Ingress Web Gateway | - |
| **Frontend Dev Server** | `http://localhost:3000` | Direct Frontend Vite App | - |
| **Backend API Gateway** | `http://localhost:5000` | REST API & SSE Progress Stream | - |
| **MinIO Web Console** | `http://localhost:9001` | S3 Object Storage Browser | `minioadmin` / `minioadmin` |
| **MinIO S3 API Endpoint** | `http://localhost:9000` | S3 REST Service Endpoint | `minioadmin` / `minioadmin` |
| **RabbitMQ Management UI** | `http://localhost:15672` | AMQP Queue Broker Dashboard | `guest` / `guest` |
| **Redis In-Memory Database** | `localhost:6379` | Cache & Pub/Sub (`redis-cli`) | - |
| **PostgreSQL Database** | `localhost:5433` (container 5432) | Relational Database (`dam_db`) | `postgres` / `postgres` |

---

## 📊 Health Check & Diagnostic Commands

```bash
# Inspect API Gateway logs
docker compose logs -f dam-backend

# Inspect background worker cluster logs
docker compose logs -f worker

# Check active Redis keys and Pub/Sub activity
docker exec -it dam-redis redis-cli keys "*"
```
