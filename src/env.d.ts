// Cloudflare Workers/Pages Environment Extensions
// This tells TypeScript that the 'DB' binding exists and is a Cloudflare D1 Database.

interface Env {
  DB: D1Database;
}

// Ensure the global process environment matches our D1 bindings
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DB: D1Database;
    }
  }
}
