const mysql = require('mysql2/promise');

async function test(password) {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: password,
    });
    console.log(`✓ Password "${password}" is SUCCESSFUL!`);
    await connection.end();
    return true;
  } catch (err) {
    // console.log(`✗ Password "${password}" failed: ${err.message}`);
    return false;
  }
}

async function run() {
  const passes = [
    '', 'root', 'password', 'admin', '123456', 'Poland@01',
    'your_mysql_password', 'yourpassword', 'your_mysql_password_here',
    'mysql80', 'MySQL80', 'mysql', '12345', '12345678', 'rootroot',
    'admin123', 'Password123', 'Password@123', 'Root@123', 'Root123',
    'root1234', 'root@1234', 'admin@123', 'root!23', 'sql', 'mysql123',
    'root@123', 'Root@1234', 'Root1234!', 'root1234!', '1234567890',
    'dhipak', 'dhipak06', 'dhipaksankar', 'dhipaksankar06'
  ];
  for (const pass of passes) {
    const ok = await test(pass);
    if (ok) {
      process.exit(0);
    }
  }
  console.log("All passwords failed.");
}

run().catch(console.error);
