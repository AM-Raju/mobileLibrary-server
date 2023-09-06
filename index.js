const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.port || 5000;

/* CORS */
app.use(cors());
// to solve req.body undefined problem
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Mobile Library is running on port ${port}`);
});
