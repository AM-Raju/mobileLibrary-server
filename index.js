const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const port = process.env.port || 5000;
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_SK);

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
  // console.log("Authorization", authorization);
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

    /* =================================================
                 MongoDb collection block
      ===================================================*/
    const userCollection = client.db("mobileLibraryDB").collection("users");
    const authorCollection = client.db("mobileLibraryDB").collection("authors");
    const bookCollection = client.db("mobileLibraryDB").collection("books");
    const requisitionCollection = client.db("mobileLibraryDB").collection("requisition");

    /* =================================================
                    Payment Method block
      ===================================================*/
    // Create payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const fees = req.body.fees;

      if (fees) {
        const amount = parseFloat(fees) * 100;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      }
    });

    /* =================================================
                    User Block
      ===================================================*/

    //Adding user to the DB
    app.post("/users", async (req, res) => {
      const user = req.body;

      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        res.send({ message: "User already exist!" });
      } else {
        const result = await userCollection.insertOne(user);
        res.send(result);
      }
    });

    // User data update after successful payment
    app.patch("/users/:email", async (req, res) => {
      const email = req.params.email;
      const paymentInfo = req.body;
      // console.log("Payment", email, paymentInfo);

      const filter = { email: email };

      const options = { upsert: true };

      const updateDoc = {
        $set: paymentInfo,
      };

      if (filter) {
        const result = await userCollection.updateOne(filter, updateDoc, options);
        res.send(result);
      }
    });

    // Get all user data

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // Get user role
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      if (email) {
        const result = await userCollection.findOne(query);
        res.send(result);
      }
    });

    // Update reader to moderator
    app.patch("/user/:email", async (req, res) => {
      const email = req.params.email;
      // console.log(email);
      const query = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: { role: "moderator" },
      };
      if (email) {
        const result = await userCollection.updateOne(query, updateDoc, options);
        res.send(result);
      }
    });

    // Delete user

    app.delete("/users/:email", async (req, res) => {
      const email = req.params.email;

      const query = { email: email };
      if (email) {
        const result = await userCollection.deleteOne(query);
        res.send(result);
      }
    });

    /* =================================================
                    Books Block
      ===================================================*/
    // Posting book data into the server
    app.post("/books", async (req, res) => {
      const book = req.body;
      // console.log("Bookz", book);
      const query = { title: book.title, authorId: book.authorId };
      const filter = await bookCollection.findOne(query);
      if (filter) {
        res.send({ message: "Book already exist" });
      } else {
        const result = await bookCollection.insertOne(book);
        res.send(result);
      }
    });

    // Get all book data
    app.get("/books", async (req, res) => {
      const searchText = req.query.search;
      // console.log(searchText);
      const query = {
        $or: [{ title: { $regex: searchText, $options: "i" } }],
      };
      // console.log(query, searchText);

      if (searchText) {
        const result = await bookCollection.find(query).toArray();

        res.send(result);
      } else {
        const result = await bookCollection.find().limit(10).toArray();
        res.send(result);
      }
    });

    // Get 10 Book data for pagination
    app.get(`/books/:pageNum`, async (req, res) => {
      const pageNum = parseInt(req.params.pageNum);
      if (pageNum) {
        const limitRange = 10;
        const skipRange = (pageNum - 1) * 10;
        const result = await bookCollection.find().skip(skipRange).limit(limitRange).toArray();
        res.send(result);
      }
    });

    // Get featured books from all books
    app.get("/featured-books", async (req, res) => {
      const query = { format: { $nin: ["ebook"] } };
      const result = await bookCollection.find(query).toArray();
      res.send(result);
    });

    // Get book using id
    app.get(`/book-details/:id`, async (req, res) => {
      const bookId = req.params.id;
      const id = new ObjectId(bookId);
      const query = { _id: id };
      if (bookId) {
        const result = await bookCollection.findOne(query);
        res.send(result);
      }
    });

    // Change book count after requisition or return
    app.patch("/book/:id", async (req, res) => {
      const id = req.params.id;
      const bookId = new ObjectId(id);
      const bookCount = req.body.bookCount;

      const query = { _id: bookId };
      const options = { upsert: true };
      const updateDoc = {
        $inc: { qty: bookCount },
      };

      if (id) {
        const result = await bookCollection.updateOne(query, updateDoc, options);
        res.send(result);
      }
    });

    // Delete book from all books
    app.delete("/books/:id", async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const bookId = new ObjectId(id);
      const query = { _id: bookId };
      if (id) {
        const result = await bookCollection.deleteOne(query);
        res.send(result);
      }
    });

    /* ---------------------------------------------------
                    Free Ebook Part
  -----------------------------------------------------*/

    app.get("/ebooks", async (req, res) => {
      const query = { format: "ebook" };
      const result = await bookCollection.find(query).toArray();
      res.send(result);
    });
    /* =================================================
                    Requisition Block
      ===================================================*/

    app.post("/requisition", async (req, res) => {
      const requisitionInfo = req.body;
      const query = { readerEmail: requisitionInfo.userEmail };
      const result = await requisitionCollection.insertOne(requisitionInfo);
      res.send(result);
    });

    // Update user's requisition count

    app.patch("/reader/:email", async (req, res) => {
      const email = req.params.email;
      const count = req.body;

      const query = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $inc: { requisitionCount: count.changeValue },
      };

      if (email) {
        const result = await userCollection.updateOne(query, updateDoc, options);
        res.send(result);
      }
    });

    // Get all requisitions data to show on dashboard
    app.get("/requisitions", async (req, res) => {
      const result = await requisitionCollection.find().toArray();
      res.send(result);
    });

    // Get all requisitions with delivered status
    app.get("/delivered/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      if (email) {
        const result = await requisitionCollection.find(query).toArray();
        res.send(result);
      }
    });

    // Set Moderator Status to delivered and readerStatus to received
    app.patch("/delivered/:id", async (req, res) => {
      const id = req.params.id;
      const requisitionId = new ObjectId(id);
      const filter = { _id: requisitionId };
      const options = { upsert: true };
      const updateDoc = {
        $set: { moderatorStatus: "delivered", readerStatus: "received" },
      };

      if (id) {
        const result = await requisitionCollection.updateOne(filter, updateDoc, options);
        res.send(result);
      }
    });

    // Set Moderator Status to received and readerStatus to returned
    app.patch("/returned/:id", async (req, res) => {
      const id = req.params.id;
      const requisitionId = new ObjectId(id);
      const filter = { _id: requisitionId };
      const options = { upsert: true };
      const updateDoc = {
        $set: { moderatorStatus: "received", readerStatus: "returned" },
      };

      if (id) {
        const result = await requisitionCollection.updateOne(filter, updateDoc, options);
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
      // console.log(image, authorId);

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

    // Get all authors
    app.get("/authors", async (req, res) => {
      const result = await authorCollection.find().toArray();
      res.send(result);
    });

    // get author by name
    app.get("/author", async (req, res) => {
      const authorName = req.query.name;
      console.log("Auhtor Name", authorName);
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

    // Get author by id
    app.get("/authors/:id", async (req, res) => {
      const id = req.params.id;
      // console.log("authorId", id);
      if (id) {
        const authorId = new ObjectId(id);
        const query = { _id: authorId };
        const result = await authorCollection.findOne(query);
        res.send(result);
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
