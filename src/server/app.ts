import express from "express";

const app = express();

function randomDelay(): number {
  return 300 + Math.floor(Math.random() * 2200); // 300ms to 2500ms
}

app.get("/", (req, res) => {
  res.send(`
    <h1>Flaky Shop</h1>
    <p id="status">loading...</p>
    <ul id="items"></ul>
    <script>
      fetch("/api/items")
        .then(r => r.json())
        .then(items => {
          document.getElementById("items").innerHTML =
            items.map(i => "<li>" + i + "</li>").join("");
          document.getElementById("status").textContent = items.length + " items";
        });
    </script>
  `);
});

app.get("/api/items", (req, res) => {
  const delay = randomDelay();
  setTimeout(() => res.json(["apple", "banana", "cherry"]), delay);
});

app.listen(3000, () => console.log("Flaky Shop running at http://localhost:3000"));