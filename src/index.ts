import fs from 'fs'
import { AddressInfo } from 'net'
import express from 'express'
import cors, { CorsOptions } from 'cors'
import KeycloakConnect from 'keycloak-connect'
import {
  driver as neo4jDriver,
  auth as neo4jAuth,
  Config as Neo4jConfig,
} from 'neo4j-driver'
import { config as dotenvConfig } from 'dotenv'
import createProxyRouter from './proxy'

export {
  createProxyRouter
}

// Import configuration from environment and json
dotenvConfig()

const readPasswordFromFile = (filename: string): string => {
  return fs.readFileSync(filename).toString('utf-8')
}

const verbose = process.env.NEO4J_VERBOSE || false
const neo4jHost = process.env.NEO4JPROXY_TARGET || 'neo4j://localhost'
const neo4jUserName = process.env.NEO4JPROXY_TARGET_USERNAME || 'neo4j'
const neo4jPasswordFile = process.env.NEO4JPROXY_TARGET_PASSWORD_FILE || undefined
const neo4jPassword = neo4jPasswordFile ? readPasswordFromFile(neo4jPasswordFile) : process.env.NEO4JPROXY_TARGET_PASSWORD || 'neo4j'
const secure = process.env.NEO4JPROXY_SECURE || true
const keycloakConfigFile =
  process.env.NEO4JPROXY_KEYCLOAK_CONFIG_FILE || './keycloak.json'

if (verbose) {
  console.log(`${neo4jHost}, ${neo4jUserName}, ${neo4jPassword}`)
}

const neo4jConfig: Neo4jConfig = {
  logging: {
    level: verbose ? 'debug' : 'info',
    logger: (level, message) => console.log(`[${level}] ${message}`),
  },
}

const neo4j = neo4jDriver(
  neo4jHost,
  neo4jAuth.basic(neo4jUserName, neo4jPassword),
  neo4jConfig
)

const keycloak = secure ? new KeycloakConnect({}, require(keycloakConfigFile)) : undefined

const app = express()

const corsOpts: CorsOptions = {
  origin: '*',
  allowedHeaders: '*',
  methods: '*',
}

app.use(cors(corsOpts))
app.use(express.json())
if (keycloak) {
  app.use(keycloak.middleware())
}

const proxy = createProxyRouter(neo4j, keycloak)

app.use('/', proxy)

const server = app.listen(3000, '0.0.0.0', () => {
  const info = server.address() as AddressInfo
  console.log(`neo4j-proxy up and running on ${info.address}:${info.port}`)
})

// Ensure graceful shutdown in Docker
process.on('SIGINT', () => {
  process.exit()
})

process.on('exit', () => {
  neo4j.close()
})
