# neo4j-protected-proxy

## Introduction

`neo4j-protected-proxy` is a thin proxy enabling you to expose your Neo4J server through a protected endpoint.

_Protected_ in this context means that the `/cypher` endpoints expects a Keycloak access token (JWT) as a bearer token.
It is the server's sole capability (as of now) to receive a cypher-based query with optional parameters, and return the result back to the client.

## Endpoints

|Endpoint|Verb(s)|Description|
|--------|-------|-----------|
| /      | GET | Welcome page (json) |
| /health| GET | Returns status of the underlying Neo4j connection (200 or 500)|
| /cypher| POST | Accepts a `QueryRequest` and returns a verbatim Neo4J answer |

### `QueryRequest`

```typescript
interface QueryRequest {
  query: string
  parameters?: [string, string][]
```

## Options / Configuration

| Name | Default | Description
-------|------------|----------------------
| NEO4JPROXY_TARGET | `neo4j://localhost` | Neo4J server
| NEO4JPROXY_TARGET_USERNAME | `neo4j`
| NEO4JPROXY_TARGET_PASSWORD | `neo4j`
| NEO4JPROXY_AUTHORIZED_SCOPE | `neo4j`
| NEO4JPROXY_AUTHORIZED_ROLE | `realm:neo4j-user`
| NEO4JPROXY_PROTECTION | `true` |
| NEO4JPROXY_KEYCLOAK_CONFIG_FILE | `./keycloak.json`

### Keycloak configuration file

xxx

## `neo4j-protected-proxy` as a middleware

TODO

## License

MIT

