import http from 'node:http';
import {readFileSync} from 'node:fs';
import {MongoClient} from 'mongodb';

const env = process.env;
const pw = readFileSync(env.MONGODB_PASSWORD_FILE, 'utf8').trim();
const db = env.MONGODB_DATABASE;
const url = `mongodb://${env.MONGODB_USER}:${encodeURIComponent(pw)}@${env.MONGODB_HOST}:27017/${db}?authSource=${db}`;
const notes = new MongoClient(url).db(db).collection('notes');
const head = readFileSync(new URL('./head.html', import.meta.url), 'utf8');
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const recent = () => notes.find({}, {projection: {_id: 0, text: 1}}).sort({_id: -1}).limit(50).toArray();

http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') return res.end('ok');
    if (req.method === 'POST' && req.url === '/notes') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 4096) break; }
      const text = (new URLSearchParams(body).get('text') || '').trim().slice(0, 200);
      if (text) await notes.insertOne({text});
      res.writeHead(303, {location: '/'});
      return res.end();
    }
    if (req.url === '/api/notes') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify(await recent()));
    }
    if (req.url === '/') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.end(head + (await recent()).map(n => `<li>${esc(n.text)}</li>`).join('') + '</ul>');
    }
    res.writeHead(404);
    res.end('not found');
  } catch (error) {
    console.error(error);
    res.writeHead(503);
    res.end('database unavailable');
  }
}).listen(+env.PORT || 8080, () => console.log('listening on', env.PORT || 8080));
