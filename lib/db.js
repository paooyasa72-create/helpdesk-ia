const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectDB() {
  if (cachedDb) return cachedDb;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta la variable de entorno MONGODB_URI');

  const client = new MongoClient(uri);
  await client.connect();

  cachedClient = client;
  cachedDb = client.db('helpdesk');
  return cachedDb;
}

module.exports = { connectDB };
