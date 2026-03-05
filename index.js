require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Middleware
app.use(cors());
app.use(express.json());

// JWT verification middleware
const verifyToken = (req, res, next) => {
    console.log('token inside verifyToken', req.headers.authorization);
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    const token = authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
    });
};


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.deftcj8.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const usersCollection = client.db('eduflowDB').collection('users');

        // JWT releted API
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });




        //user releted api
        app.get('/users', verifyToken, async (req, res) => {
            console.log(req.headers.authorization);
            const cursor = usersCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });

        // Inside your server's run() function
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await usersCollection.findOne(query);
            res.send(result);
        });

        //check admin
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let admin = false;
            if (user?.role === 'admin') {
                admin = true;
            }
            res.send({ admin });
        });

        app.patch('/users/admin/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            };
            const result = await usersCollection.updateOne(query, updatedDoc);
            res.send(result);
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'User already exists' });
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        //await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('EduFlow server is running');
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});