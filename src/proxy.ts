import path from 'path'
import { existsSync } from 'fs'
import express, { Router } from 'express'
import KeycloakConnect, { GaurdFn } from 'keycloak-connect'
import {
  Driver,
} from 'neo4j-driver'

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

export interface QueryRequest {
  query: string
  parameters?: [string, string][]
}

export interface TokenWithContent extends KeycloakConnect.Token {
  content: {
    scope: string | string[]
  }
}

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

/**
 *
 * Configures a new express router for the proxy.
 * 
 * @param neo4j - an instance of the Neo4j driver (from the `neo4j-driver` package)
 * @param keycloak - an optional instance of the KeycloakConnect instance (from the `keycloak-connect` package). Note that if you leave this one out, the proxy will not be secured.
 * @returns an express router instance
*/
export default (
  neo4j: Driver,
  keycloak?: KeycloakConnect.Keycloak,
): Router => {
    const router = express.Router()

    router.get('/', (__, res, _) => {
        res.json({ message: `Welcome to the ${pkgName}`, version: pkgVersion })
        res.status(200).end()
      })
      
      router.get('/health', async (_, res) => {
        try {
          const info = await neo4j.verifyConnectivity()
          res.json(info).status(200).end()
        } catch (error) {
          res.json(error).status(500).end()
        }
      })
      
      const isAuthorized = keycloak ? keycloak.protect(hasScope('client')) : () => true

      router.post(
        '/cypher',
        isAuthorized,
        async (req: express.Request, res: express.Response) => {
          const session = neo4j.session()
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
    return router
}
