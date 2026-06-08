async function test() {
  const res = await fetch("http://localhost:3005/api/tickets/1");
  const data = await res.json();
  console.log("API response:", JSON.stringify(data, null, 2));
}
test();
