import { AddressInfo } from 'net'
import express from 'express'
import KeycloakConnect from 'keycloak-connect'
import {
  driver as neo4jDriver,
  auth as neo4jAuth,
  Config as Neo4jConfig,
} from 'neo4j-driver'
import { config as dotenvConfig } from 'dotenv'

// Import configuration from environment and json
dotenvConfig()

const neo4jHost = process.env.NEO4JPROXY_TARGET || "neo4j://localhost"
const neo4jUserName = process.env.NEO4JPROXY_TARGET_USERNAME || "neo4j"
const neo4jPassword = process.env.NEO4JPROXY_TARGET_PASSWORD || "neo4j"
console.log(`${neo4jHost}, ${neo4jUserName}, ${neo4jPassword}`)

import keycloakConfig from './keycloak.json'

const app = express()

const neo4jConfig: Neo4jConfig = {
  logging: {
    logger: (level, message) => console.log(`[${level}] ${message}`),
  },
}

// TODO get from environment
const driver = neo4jDriver(
  neo4jHost,
  neo4jAuth.basic(neo4jUserName, neo4jPassword),
  neo4jConfig
)

const keycloak = new KeycloakConnect({}, keycloakConfig)

// Ensure graceful shutdown in Docker
process.on('SIGINT', () => {
  process.exit()
})
process.on('exit', () => {
  driver.close()
})

app.use(express.json())
app.use(keycloak.middleware())

app.get('/', (req, res, _) => {
  res.json({ message: 'welcome to the neo4j-proxy', version: '0.1.0' })
  res.status(200).end()
})

app.get('/verifyConnectivity', async (_, res) => {
  try {
    const info = await driver.verifyConnectivity()
    res.json(info).status(200).end()
  } catch (error) {
    res.json(error).status(500).end()
  }
})

interface QueryRequest {
  query: string
  parameters?: [string, string][]
}

app.post(
  '/execCypher',
  keycloak.protect('realm:client-user'),
  async (req: express.Request, res: express.Response) => {
    const session = driver.session()
    const tx = session.beginTransaction()
    try {
      const request = req.body as QueryRequest
      const result = await tx.run(request.query, request.parameters)
      res.json(result)
      res.status(200).end()
      tx.commit()
    } catch (error) {
      tx.rollback()
      res.json(error).status(400).end()
    }
  }
)

const server = app.listen(3000, '0.0.0.0', () => {
  const info = server.address() as AddressInfo
  console.log(`neo4j-proxy up and running on ${info.address}:${info.port}`)
})
