import { FalkorDB } from "falkordb"

const FALKORDB_URL = process.env.FALKORDB_URL || "redis://localhost:16379"

let falkorInstance: FalkorDB | null = null

export async function getFalkorDB(): Promise<FalkorDB> {
  if (!falkorInstance) {
    falkorInstance = await FalkorDB.connect({
      socket: {
        host: new URL(FALKORDB_URL).hostname,
        port: parseInt(new URL(FALKORDB_URL).port || "16379", 10),
      },
    })
  }
  return falkorInstance
}

export async function getGraph(name = "galatea") {
  const db = await getFalkorDB()
  return db.selectGraph(name)
}

export async function closeFalkorDB(): Promise<void> {
  if (falkorInstance) {
    await falkorInstance.close()
    falkorInstance = null
  }
}
