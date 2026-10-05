import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./data/daily_snapshots.json', 'utf-8'));
const row = data['2026-10-03'];

const escapedJson = JSON.stringify(row.armies).replace(/'/g, "''");

const sql = `INSERT INTO daily_snapshots (date, timestamp, armies, iso)
VALUES (
  '${row.date}',
  ${row.timestamp},
  '${escapedJson}'::jsonb,
  '${row.iso}'
)
ON CONFLICT (date) DO UPDATE SET
  timestamp = EXCLUDED.timestamp,
  armies = EXCLUDED.armies,
  iso = EXCLUDED.iso;
`;

fs.writeFileSync('./data/insert_snapshot.sql', sql);
console.log('Successfully generated ./data/insert_snapshot.sql');
