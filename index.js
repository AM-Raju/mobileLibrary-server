const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const port = process.env.port || 5000;

/* CORS */
app.use(cors());
// to solve req.body undefined problem
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2jzgz56.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Verify JWT middleware
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  console.log("Authorization", authorization);
  if (!authorization) {
    return res.status(401).send({ error: true, message: "Unauthorized Access" });
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: "Unauthorized Access" });
    }
    req.decoded = decoded;
  });
  next();
};

async function run() {
  try {
    // JWT Token generation
    app.post("/jwt", (req, res) => {
      const email = req.body;

      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "10h" });

      res.send({ token });
    });

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // MongoDB Collections
    const userCollection = client.db("mobileLibraryDB").collection("users");
    const authorCollection = client.db("mobileLibraryDB").collection("authors");
    const bookCollection = client.db("mobileLibraryDB").collection("books");

    //Adding user to the DB
    app.post("/users", async (req, res) => {
      const user = req.body;
      console.log("from app.pos", user);
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        res.send({ message: "User already exist!" });
      } else {
        const result = await userCollection.insertOne(user);
        res.send(result);
      }
    });
    /* =================================================
                    Books Block
      ===================================================*/
    app.post("/books", async (req, res) => {
      const book = req.body;
      const query = { title: book.title, authorId: book.authorId };
      const filter = await bookCollection.findOne(query);
      if (filter) {
        res.send({ message: "Book already exist" });
      } else {
        const result = await bookCollection.insertOne(book);
        res.send(result);
      }
    });

    /* =================================================
                    Authors Block
      ===================================================*/
    // Adding author to the db
    app.post("/authors", async (req, res) => {
      const author = req.body;
      const query = { name: author.name, country: author.country };
      const filter = await authorCollection.findOne(query);
      if (filter) {
        res.send({ message: "Author already exist" });
      } else {
        const result = await authorCollection.insertOne(author);
        res.send(result);
      }
    });

    // Update author data with author image
    app.patch("/authors", async (req, res) => {
      const { image, authorId } = req.body;
      console.log(image, authorId);

      if (authorId) {
        const id = new ObjectId(authorId);
        const filter = { _id: id };
        if (filter) {
          const option = { upsert: true };
          const updateDoc = {
            $set: {
              image: image,
            },
          };

          const result = await authorCollection.updateOne(filter, updateDoc, option);
          res.send(result);
        }
      }
    });

    // get author by name
    app.get("/authors", async (req, res) => {
      const authorName = req.query.name;
      if (authorName) {
        const query = { name: authorName };
        const result = await authorCollection.findOne(query);
        if (!result) {
          res.send({ message: "No author found!" });
        } else {
          res.send(result);
        }
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Mobile Library is running on port ${port}`);
});
