import dotenv from "dotenv";
dotenv.config();
import pkg from 'pg';
const { Pool } = pkg;

import {readFileSync} from "fs";

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

export async function createTables() {
  await aoPool.query(
      `
            --------------- results
            CREATE TABLE IF NOT EXISTS results (
                process_id text,
                message_id text,
                result jsonb,
                nonce bigint,
                timestamp timestamp with time zone default now(),
                UNIQUE (process_id, message_id)
            );
            CREATE INDEX IF NOT EXISTS idx_results_process_id ON results(process_id);
            CREATE INDEX IF NOT EXISTS idx_results_process_id_nonce ON results(process_id, nonce DESC);
    `
  );
}

export async function insertResult({ processId, messageId, result, nonce }) {
  await aoPool.query(
      `INSERT INTO results (process_id, message_id, result, nonce) VALUES ($1, $2, $3, $4) 
       ON CONFLICT(process_id, message_id) DO NOTHING`,
      [processId, messageId, result, nonce],
  )
}

export async function getLatestResult({ processId }) {
  const result = await aoPool.query(
      `SELECT message_id, nonce, result
       FROM results
       WHERE process_id = $1 ORDER BY nonce DESC LIMIT 1;`,
      [processId],
  )
  return result && result.rows && result.rows.length > 0 ? {
    messageId: result.rows[0].message_id,
    nonce: result.rows[0].nonce,
    result: result.rows[0].result
  } : null;
}

export async function getForMsgId({ processId, messageId }) {
  const result = await aoPool.query(
      `SELECT message_id, nonce, result
       FROM results
       WHERE process_id = $1 AND message_id = $2`,
      [processId, messageId],
  )
  return result && result.rows && result.rows.length > 0 ? {
    messageId: result.rows[0].message_id,
    nonce: result.rows[0].nonce,
    result: result.rows[0].result
  } : null;
}

export async function getLessOrEq({ processId, messageId, nonce }) {
  const result = await aoPool.query(
      `SELECT message_id, nonce, result
       FROM results
       WHERE process_id = $1 AND message_id = $2 AND nonce <= $3`,
      [processId, messageId, nonce],
  )
  return result && result.rows && result.rows.length > 0 ? {
    messageId: result.rows[0].message_id,
    nonce: result.rows[0].nonce,
    result: result.rows[0].result
  } : null;
}

