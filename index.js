require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5008;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Middleware
app.use(cors());
app.use(express.json());

// 1. GLOBAL VARIABLE (The Key)
let usersCollection;

// JWT verification middleware
const verifyToken = (req, res, next) => {
  console.log("token inside verifyToken", req.headers.authorization);
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

//use verify admin after verify token
const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  const query = { email: email };
  const user = await usersCollection.findOne(query);
  if (user?.role !== "admin") {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

//use verify teacher after verify token
const verifyTeacher = async (req, res, next) => {
    const email = req.decoded.email;
    const query = { email: email };
    const user = await usersCollection.findOne(query);
    if (user?.role !== 'teacher') {
        return res.status(403).send({ message: 'forbidden access' });
    }
    next();
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.deftcj8.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    usersCollection = client.db("eduflowDB").collection("users");
    const teachersRequestCollection = client
      .db("eduflowDB")
      .collection("teachers-request");

    // JWT releted API
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    //teachers request api

    app.get("/teachers-requests", async (req, res) => {
      const cursor = teachersRequestCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/teachers-requests", async (req, res) => {
      const request = req.body;
      const result = await teachersRequestCollection.insertOne(request);
      res.send(result);
    });

    app.get("/teachers-requests/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await teachersRequestCollection.findOne(query);
      res.send(result);
    });

    //check Teacher
    app.get("/users/teacher/:email", verifyToken, async (req, res) => {
        const email = req.params.email;
        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "forbidden access" });
        }
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        let teacher = false;
        if (user?.role === "teacher") {
          teacher = true;
        }
        res.send({ teacher });
      });

    // Update this route in your server.js
    app.patch(
      "/teachers-requests/approve/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const email = req.body.email; // Get email from request body
        const query = { _id: new ObjectId(id) };

        // 1. Update the request status
        const updatedRequest = {
          $set: { status: "approved" },
        };
        const requestResult = await teachersRequestCollection.updateOne(
          query,
          updatedRequest
        );

        // 2. Update the user role in usersCollection
        const userQuery = { email: email };
        const updatedUser = {
          $set: { role: "teacher" },
        };
        const userResult = await usersCollection.updateOne(
          userQuery,
          updatedUser
        );

        res.send({ requestResult, userResult });
      }
    );

    //user releted api
    app.get("/users", verifyToken, async (req, res) => {
      console.log(req.headers.authorization);
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Inside your server's run() function
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    //check admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user?.role === "admin") {
        admin = true;
      }
      res.send({ admin });
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await usersCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("EduFlow server is running");
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
