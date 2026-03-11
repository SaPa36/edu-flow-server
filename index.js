require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5008;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Middleware
app.use(cors(
    [
        "https://console.firebase.google.com/project/edu-flow-ef9b1/overview",
        "https://edu-flow-ef9b1.web.app",
        "http://localhost:5173",
    ]
));
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
    if (user?.role !== "teacher") {
        return res.status(403).send({ message: "forbidden access" });
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
        //await client.connect();

        usersCollection = client.db("eduflowDB").collection("users");
        const teachersRequestCollection = client
            .db("eduflowDB")
            .collection("teachers-request");
        const classesCollection = client.db("eduflowDB").collection("classes");
        const paymentsCollection = client.db("eduflowDB").collection("payments");

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

        app.delete("/teachers-requests/:id", verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await teachersRequestCollection.deleteOne(query);
            res.send(result);
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


        app.patch(
            "/teachers-requests/reject/:id",
            verifyToken,
            verifyAdmin,
            async (req, res) => {
                const id = req.params.id;
                const { email } = req.body; // Ensure you are receiving this
                const query = { _id: new ObjectId(id) };

                // 1. Update request status to rejected
                const requestResult = await teachersRequestCollection.updateOne(
                    query,
                    { $set: { status: "rejected" } }
                );

                // 2. IMPORTANT: Demote the user back to "student"
                const userResult = await usersCollection.updateOne(
                    { email: email },
                    { $set: { role: "student" } }
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

        app.patch('/users/:email', verifyToken, async (req, res) => {
          const email = req.params.email;
          const updatedData = req.body;
          const filter = { email: email };
          const updateDoc = {
              $set: {
                  name: updatedData.name,
                  image: updatedData.image,
                  bio: updatedData.bio 
              },
          };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.send(result);
      });


        app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
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

        // Admin Stats Endpoint
        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            try {
                // 1. Get counts from different collections
                const totalUsers = await usersCollection.estimatedDocumentCount();
                const totalClasses = await classesCollection.estimatedDocumentCount();

                // 2. Aggregate payments for revenue
                const result = await paymentsCollection.aggregate([
                    {
                        $group: {
                            _id: null,
                            totalRevenue: { $sum: '$price' }
                        }
                    }
                ]).toArray();

                const totalRevenue = result.length > 0 ? result[0].totalRevenue : 0;

                // 3. Count pending requests
                const pendingRequests = await classesCollection.countDocuments({ status: 'pending' });

                res.send({
                    totalUsers,
                    totalClasses,
                    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
                    pendingRequests
                });

            } catch (error) {
                res.status(500).send({ message: "Error fetching admin stats" });
            }
        });

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

        //classes related api
        app.get("/classes", async (req, res) => {
            try {
                const cursor = classesCollection.find();
                const result = await cursor.toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error fetching classes", error });
            }
        });

        app.get("/classes/:email", verifyToken, verifyTeacher, async (req, res) => {
            try {
                const email = req.params.email;

                // Security Check: Ensure the requested email matches the token's email
                if (req.decoded.email !== email) {
                    return res.status(403).send({ message: "forbidden access" });
                }

                const query = { email: email };
                const result = await classesCollection.find(query).toArray();
                res.send(result);
            } catch (error) {
                res
                    .status(500)
                    .send({ message: "Error fetching teacher classes", error });
            }
        });

        // 2. Patch status update
        app.patch(
            "/classes/status/:id",
            verifyToken,
            verifyAdmin,
            async (req, res) => {
                const id = req.params.id;
                const { status } = req.body;
                const query = { _id: new ObjectId(id) };
                const updateDoc = { $set: { status: status } };
                const result = await classesCollection.updateOne(query, updateDoc);
                res.send(result);
            }
        );

        app.delete("/classes/:id", verifyToken, verifyTeacher, async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) };

                // Optional: Ensure the person deleting the class is the one who created it
                const targetClass = await classesCollection.findOne(query);
                if (targetClass.email !== req.decoded.email) {
                    return res
                        .status(403)
                        .send({ message: "You can only delete your own classes" });
                }

                const result = await classesCollection.deleteOne(query);
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error deleting class", error });
            }
        });



        app.post("/classes", verifyToken, verifyTeacher, async (req, res) => {
            const newClass = req.body;
            const result = await classesCollection.insertOne(newClass);
            res.send(result);
        });

        //payment related api will be here

        app.get("/payments/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                return res.status(403).send({ message: "forbidden access" });
            }
            const query = { email: email };
            const result = await paymentsCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', verifyToken, async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            // CRITICAL: Ensure you send this back so the frontend knows it finished!
            res.send(result);
        });

        // Send a ping to confirm a successful connection
        //await client.db("admin").command({ ping: 1 });
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
