import { AddressInfo } from 'net'
import path from 'path'
import { existsSync } from 'fs'
import express from 'express'
import cors, {CorsOptions} from 'cors'
import KeycloakConnect, { GaurdFn } from 'keycloak-connect'
import {
  driver as neo4jDriver,
  auth as neo4jAuth,
  Config as Neo4jConfig,
} from 'neo4j-driver'
import { config as dotenvConfig } from 'dotenv'

export interface QueryRequest {
  query: string
  parameters?: [string, string][]
}

export interface TokenWithContent extends KeycloakConnect.Token {
  content: {
    scope: string | string[]
  }
}

// Import configuration from environment and json
dotenvConfig()

const verbose = process.env.NEO4J_VERBOSE || false
const neo4jHost = process.env.NEO4JPROXY_TARGET || 'neo4j://localhost'
const neo4jUserName = process.env.NEO4JPROXY_TARGET_USERNAME || 'neo4j'
const neo4jPassword = process.env.NEO4JPROXY_TARGET_PASSWORD || 'neo4j'
const isProtected = process.env.NEO4JPROXY_PROTECTED || true
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

// TODO get from environment
const driver = neo4jDriver(
  neo4jHost,
  neo4jAuth.basic(neo4jUserName, neo4jPassword),
  neo4jConfig
)

// if config file does not exist - error.
const keycloakConfig = require(keycloakConfigFile)

const keycloak = new KeycloakConnect({}, keycloakConfig)

let pkgName = 'neo4j-protected-proxy'
let pkgVersion = 'unknown'
let packageJsonPath = path.join(__dirname, './package.json')
if (existsSync(packageJsonPath)) {
  const pkg = require(packageJsonPath)
  pkgName = pkg.name
  pkgVersion = pkg.version
} else {
  packageJsonPath = path.join(path.join(__dirname, '../'), 'package.json')
  if (existsSync(packageJsonPath)) {
    const pkg = require(packageJsonPath)
    pkgName = pkg.name
    pkgVersion = pkg.version
  }
}

const intersects = <T>(arr1: T[], arr2: T[]): boolean => {
  return arr1.some((item) => arr2.includes(item))
}


const app = express()

const corsOpts : CorsOptions = {
  origin: '*',
  allowedHeaders: '*',
  methods: '*'
}
app.use(cors())
app.use(express.json())
app.use(keycloak.middleware())

app.get('/', (__, res, _) => {
  res.json({ message: `Welcome to the ${pkgName}`, version: pkgVersion })
  res.status(200).end()
})

app.get('/health', async (_, res) => {
  try {
    const info = await driver.verifyConnectivity()
    res.json(info).status(200).end()
  } catch (error) {
    res.json(error).status(500).end()
  }
})

const hasScope = (scope: string | string[]): GaurdFn => {
  return function (
    accessToken: KeycloakConnect.Token,
    req: express.Request,
    res: express.Response
  ): boolean {
    var x = accessToken as TokenWithContent
    let scopes = []
    if (Array.isArray(x.content.scope)) {
      scopes = x.content.scope
    } else {
      scopes = x.content.scope.split(' ').map((x) => x.trim())
    }
    const expectedScopes = Array.isArray(scope) ? scope : [scope]
    return intersects(expectedScopes, scopes)
  }
}

const isAuthorized = isProtected ? hasScope('client') : () => true

app.post(
  '/cypher',
  keycloak.protect(isAuthorized),
  async (req: express.Request, res: express.Response) => {
    const session = driver.session()
    const tx = session.beginTransaction()
    try {
      const request = req.body as QueryRequest
      if (!request) {
        res.json({ message: 'Body must be a QueryRequest.' }).status(400).end()
        return
      }
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


// Ensure graceful shutdown in Docker
process.on('SIGINT', () => {
  process.exit()
})
process.on('exit', () => {
  driver.close()
})
