import dotenv from "dotenv";
import pkg from 'pg';
import {readFileSync} from "fs";
import {getLogger} from "./logger.mjs";

dotenv.config();
const { Pool } = pkg;

const dbConfig = {
  max: 20,
  application_name: 'AO_CU',
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_USER_PASSWORD,
  database: process.env.PG_DATABASE.toLowerCase(),
  idle_in_transaction_session_timeout: 300000,
  port: process.env.PG_PORT,
  ...(process.env.PG_SSL === "true" ? {
    ssl: {
      rejectUnauthorized: false,
      ca: readFileSync('certs/db/ca.pem').toString(),
      key: readFileSync('certs/db/dre/key.pem').toString(),
      cert: readFileSync('certs/db/dre/cert.pem').toString()
    }
  } : ''),
}

const aoPool = new Pool(dbConfig);
const logger = getLogger("db", "trace");

export async function closePool() {
  await aoPool.end();
}

export async function createTables() {
  await aoPool.query(
      `
            --------------- results
            CREATE TABLE IF NOT EXISTS results (
                process_id text,
                message_id text,
                result jsonb,
                nonce bigint,
                message_timestamp bigint,
                timestamp timestamp with time zone default now(),
                UNIQUE (process_id, message_id)
            );
            CREATE INDEX IF NOT EXISTS idx_results_process_id ON results(process_id);
            CREATE INDEX IF NOT EXISTS idx_results_message_timestamp ON results(message_timestamp);
            CREATE INDEX IF NOT EXISTS idx_results_process_id_nonce ON results(process_id, nonce DESC);
            CREATE INDEX IF NOT EXISTS idx_results_process_id_message_timestamp ON results(process_id, message_timestamp);
    `
  );
}

export async function insertResult({ processId, messageId, result, nonce, timestamp }) {
  delete result.Memory;
  await aoPool.query(
      `INSERT INTO results (process_id, message_id, result, nonce, message_timestamp) VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT(process_id, message_id) DO NOTHING`,
      [processId, messageId, result, nonce, timestamp],
  )
}

export async function getForMsgId({ processId, messageId }) {
  const result = await aoPool.query(
      `SELECT message_id, nonce, message_timestamp, result
       FROM results
       WHERE process_id = $1 AND message_id = $2`,
      [processId, messageId],
  )
  return result && result.rows && result.rows.length > 0 ? {
    messageId: result.rows[0].message_id,
    nonce: parseInt(result.rows[0].nonce),
    timestamp: parseInt(result.rows[0].message_timestamp),
    result: result.rows[0].result
  } : null;
}

export async function getLessOrEq({ processId, nonce }) {
  logger.trace({ processId, nonce });
  const queryResult = await aoPool.query(
      `SELECT message_id, nonce, message_timestamp as "mTimestamp", result
       FROM results
       WHERE process_id = $1 AND nonce <= $2
       ORDER BY nonce DESC LIMIT 1`,
      [processId, nonce],
  )
  //logger.trace(queryResult.rows[0]);
  //logger.trace(queryResult.rows[0].mTimestamp);
  // logger.trace(result);

  return queryResult && queryResult.rows && queryResult.rows.length > 0 ? {
    timestamp: parseInt(queryResult.rows[0].mTimestamp),
    messageId: queryResult.rows[0].message_id,
    nonce: parseInt(queryResult.rows[0].nonce),
    result: queryResult.rows[0].result
  } : null;
}

