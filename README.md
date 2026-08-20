# Digital Asset Management (DAM) Platform

An enterprise-grade, microservice-based **Digital Asset Management (DAM)** platform engineered for high-volume media ingestion, automated background video transcoding and image processing, real-time progress streaming, and content analytics.

---

## 🏗️ Architecture Overview

The system is built on a high-throughput microservices architecture operating within an On-Premise Docker container network.

```
+-----------------------------------------------------------------------------------------+
|                                ON-PREMISE INFRASTRUCTURE                                |
|                                                                                         |
|                               +-----------------------+                                 |
|                               |  Nginx Reverse Proxy  | (Ingress & Layer 1 Rate Limit)  |
|                               +-----------+-----------+                                 |
|                                           |                                             |
|                     +---------------------+---------------------+                       |
|                     |                                           |                       |
|                     v                                           v                       |
|          +----------------------+                    +----------------------+           |
|          | Frontend Web Bundle  |                    |     API Service      |           |
|          | (React / Vite App)   |                    |   (Node.js/Express)  |           |
|          +----------------------+                    +----------+-----------+           |
|                                                                 |                       |
|                                                                 v                       |
|                                                      +----------------------+           |
|                                                      |    Queue Service     |           |
|                                                      |      (RabbitMQ)      |           |
|                                                      +----------+-----------+           |
|                                                                 |                       |
|                                                                 v                       |
|                                                      +----------------------+           |
|                                                      |    Worker Service    |           |
|                                                      |   (FFmpeg / Sharp)   |           |
|                                                      +----------+-----------+           |
|                                                                 |                       |
|     +-----------------------------------------------------------+                       |
|     |                                                                                   |
|     v                                                                                   |
|  +-----------------------------------------------------------------------------------+  |
|  |                                    DATA LAYER                                     |  |
|  |  +---------------------+   +--------------------------+   +--------------------+  |  |
|  |  | PostgreSQL Database |   | Redis In-Memory Store    |   | MinIO Object Store |  |  |
|  |  +---------------------+   +--------------------------+   +--------------------+  |  |
|  +-----------------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------------+
```

---

## ✨ Key Technical Highlights

* **Direct Storage Ingestion**: Generates S3 presigned PUT URLs for direct client-to-MinIO file uploads (`raw-assets` bucket), bypassing API memory and network bandwidth bottlenecks.
* **Asynchronous Media Offloading**: Heavy tasks (FFmpeg 720p/1080p video transcoding, Sharp 300x300 thumbnail generation) are offloaded to background workers via RabbitMQ (`asset_processing` queue), keeping HTTP API response times under **50ms**.
* **Real-Time Progress Streaming (SSE + Redis Pub/Sub)**: Pushes sub-10ms transcoding progress updates to the UI using **Server-Sent Events (SSE)** backed by zero-disk Redis Pub/Sub, eliminating HTTP polling overhead entirely.
* **Dual-Bucket Storage Strategy**: Decouples original master files (`raw-assets`) from derived thumbnails and resolution streams (`processed-assets`) in MinIO, keeping worker instances 100% stateless and horizontally scalable.
* **2-Layer Defense-in-Depth Security**: 
  * **Layer 1 (Nginx Ingress)**: Drops DDoS floods, SYN attacks, and IP scrapers in < 0.1ms at the network boundary (`limit_req_zone`).
  * **Layer 2 (Redis + Node.js API)**: Enforces user-authenticated quotas and cluster-wide upload limits across scalable API container pods.
* **5-Pillar Redis Performance Strategy**: Redis RAM is leveraged for download counters, top-download leaderboards (`ZSET`), gallery query caching, real-time SSE progress streaming (`Pub/Sub`), and worker distributed locks (`SET NX EX`).

---

## 🛠️ Technology Stack

| Layer | Technology | Responsibilities |
| :--- | :--- | :--- |
| **Ingress & Proxy** | Nginx | Static SPA bundle hosting, reverse proxying, SSL termination, Layer 1 IP rate limiting. |
| **Frontend Web App** | React, Vite, TypeScript, Tailwind CSS | Upload UI with 2-stage progress bars, responsive media gallery, video player modal, admin dashboard charts. |
| **API Gateway** | Node.js, Express, TypeScript, Prisma | REST endpoints, presigned URL generation, metadata DB operations, task dispatching, SSE progress streaming. |
| **Worker Cluster** | Node.js, TypeScript, `amqplib`, FFmpeg, Sharp | Consumes RabbitMQ task queue, resizes images, transcodes videos, updates Redis Pub/Sub progress, uploads outputs. |
| **Object Storage** | MinIO (S3 Compatible) | Centralized blob storage hosting `raw-assets` and `processed-assets` buckets. |
| **Message Broker** | RabbitMQ (AMQP) | Durable, persistent task queues with dead-letter exchange support (`asset_processing_dlx`). |
| **In-Memory Store** | Redis 7 | High-speed cache, real-time SSE Pub/Sub bus, download analytics leaderboards, rate limits, worker locks. |
| **Database** | PostgreSQL 16 | Relational metadata store for asset records, taxonomy tags, asset-tag mappings, and execution states. |

---

## 🚀 Getting Started

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with Docker Compose v2)

### 1. Launching Local Development Cluster
Clone the repository and launch the full containerized stack:

```bash
# Copy environment template
cp .env.example .env

# Build and start all container services
docker compose up -d --build
```

### 2. Horizontally Scaling Workers
To scale media processing throughput for high concurrent uploads:

```bash
# Scale background worker nodes to 5 parallel instances
docker compose up -d --scale worker=5
```

---

## 🌐 Service Ports & Local Access Dashboards

| Service | Address | Description | Credentials (Dev) |
| :--- | :--- | :--- | :--- |
| **Frontend Web Application** | `http://localhost:3000` | Web UI & Admin Dashboard | - |
| **Backend API Gateway** | `http://localhost:5000` | REST API & SSE Progress Stream | - |
| **MinIO Console** | `http://localhost:9001` | S3 Object Storage Web GUI | `minioadmin` / `minioadmin` |
| **MinIO S3 Endpoint** | `http://localhost:9000` | S3 REST API Endpoint | `minioadmin` / `minioadmin` |
| **RabbitMQ Management** | `http://localhost:15672` | Queue Broker Dashboard | `guest` / `guest` |
| **Redis Server** | `localhost:6379` | In-Memory Cache & Pub/Sub | - |
| **PostgreSQL Database** | `localhost:5432` | Relational Metadata DB (`dam_db`) | `postgres` / `postgres` |
