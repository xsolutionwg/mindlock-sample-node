import http from 'node:http';
import {readFileSync} from 'node:fs';

// Storage: a database attached in Mindlock (DATABASE_URL, PostgreSQL) or the built-in per-app MongoDB.
const env = process.env;
const head = readFileSync(new URL('./head.html', import.meta.url), 'utf8');
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

async function storage() {
  if ((env.DATABASE_URL || '').startsWith('postgres')) {
    const {default: pg} = await import('pg');
    const pool = new pg.Pool({connectionString: env.DATABASE_URL, max: 5});
    await pool.query('create table if not exists notes (id serial primary key, text text not null, at timestamptz default now())');
    return {
      kind: 'PostgreSQL',
      add: text => pool.query('insert into notes (text) values ($1)', [text]),
      recent: async () => (await pool.query('select text from notes order by id desc limit 50')).rows,
      count: async () => Number((await pool.query('select count(*) from notes')).rows[0].count),
    };
  }
  const {MongoClient} = await import('mongodb');
  const pw = readFileSync(env.MONGODB_PASSWORD_FILE, 'utf8').trim();
  const db = env.MONGODB_DATABASE;
  const url = `mongodb://${env.MONGODB_USER}:${encodeURIComponent(pw)}@${env.MONGODB_HOST}:27017/${db}?authSource=${db}`;
  const notes = new MongoClient(url).db(db).collection('notes');
  return {
    kind: 'MongoDB',
    add: text => notes.insertOne({text}),
    recent: () => notes.find({}, {projection: {_id: 0, text: 1}}).sort({_id: -1}).limit(50).toArray(),
    count: () => notes.countDocuments(),
  };
}

const store = await storage();
// Start-up self-check: proves from the logs alone that writes reach the database and survive restarts.
await store.add(`started at ${new Date().toISOString()}`);
console.log(`storage=${store.kind} notes=${await store.count()}`);

http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') return res.end('ok');
    if (req.method === 'POST' && req.url === '/notes') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 4096) break; }
      const text = (new URLSearchParams(body).get('text') || '').trim().slice(0, 200);
      if (text) await store.add(text);
      res.writeHead(303, {location: '/'});
      return res.end();
    }
    if (req.url === '/api/notes') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify(await store.recent()));
    }
    if (req.url === '/') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      const page = head.replace('MongoDB', store.kind);
      return res.end(page + (await store.recent()).map(n => `<li>${esc(n.text)}</li>`).join('') + '</ul>');
    }
    res.writeHead(404);
    res.end('not found');
  } catch (error) {
    console.error(error);
    res.writeHead(503);
    res.end('database unavailable');
  }
}).listen(+env.PORT || 8080, () => console.log('listening on', env.PORT || 8080));
