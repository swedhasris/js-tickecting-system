const sqlite3 = require('sqlite3').verbose();
const dbPath = './timesheet.sqlite';
const db = new sqlite3.Database(dbPath);

db.all("SELECT * FROM tickets WHERE ticket_number = 'INC3775301'", [], (err, rows) => {
  if (err) {
    console.error(err);
    return;
  }
  if (rows.length > 0) {
    const row = rows[0];
    for (const key in row) {
      console.log(`${key}: ${row[key]} (type: ${typeof row[key]})`);
    }
  }
  db.close();
});
