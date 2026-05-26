# Scaling Strategy

## Horizontal Scaling

- Kubernetes HPA enabled
- Stateless execution workers
- Redis-backed coordination

## Database Scaling

- Read replicas
- Connection pooling
- Scheduled vacuuming

## RPC Scaling

- Multi-provider strategy
- Failover support
- Request throttling

## Queue Scaling

- Separate execution queues
- Retry isolation
- Dead-letter queues

## Monitoring

Track:
- CPU
- memory
- queue depth
- execution latency
- RPC latency
