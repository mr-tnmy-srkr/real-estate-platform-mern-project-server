const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
// npm install --save stripe
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://real-estate-platform-mern.web.app",
    "https://real-estate-platform-mern.firebaseapp.com",
    "https://real-estate-platform-mern-project.netlify.app",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log(token);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@realestatecluster.oasu3cn.mongodb.net/?retryWrites=true&w=majority`;

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
    client.connect();
    const usersCollection = client.db("RealEstateDB").collection("users");
    const bookingsCollection = client.db("RealEstateDB").collection("bookings");
    const reviewsCollection = client.db("RealEstateDB").collection("reviews");
    const wishlistCollection = client
      .db("RealEstateDB")
      .collection("wishlists");
    const propertiesCollection = client
      .db("RealEstateDB")
      .collection("properties");

    //Role Verification MiddleWare
    //For Admin
    const verifyAdmin = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "admin")
        return res.status(401).send({ message: "unauthorized access" });
      next();
    };

    //For Agent
    const verifyAgent = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "agent")
        return res.status(401).send({ message: "unauthorized access" });
      next();
    };

    // auth related api
    app.post("/jwt", async (req, res) => {
      try {
        const user = req.body;
        console.log("I need a new jwt web Token", user);
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "7d",
        });
        res
          .cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
      } catch (jwtError) {
        res.status(500).send(jwtError);
      }
    });

    // Logout & clearCookie
    app.post("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
        console.log("Logout successful");
      } catch (logoutError) {
        res.status(500).send(logoutError);
      }
    });

    // Save user data
    app.put("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = req.body;
        const query = { email: email };
        const options = { upsert: true };
        const isExist = await usersCollection.findOne(query);
        console.log("user already exists", isExist);
        if (isExist) return res.send(isExist);
        const result = await usersCollection.updateOne(
          query,
          {
            $set: { ...user, timestamp: Date.now() },
          },
          options
        );
        res.send(result);
      } catch (dbError) {
        res.status(500).send(dbError);
      }
    });

    // Get user role
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    //get all properties
    app.get("/properties", async (req, res) => {
      const result = await propertiesCollection.find().toArray();
      res.send(result);
    });
    //get single properties
    app.get("/property/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await propertiesCollection.findOne(query);
      res.send(result);
    });

    //For USer
    // add to wishlist
    app.post("/wishlist/single-property", verifyToken, async (req, res) => {
      const wishlistData = req.body;
      const query = {
        oldId: wishlistData.oldId,
        userEmail: wishlistData.userEmail,
      };
      const existingUser = await wishlistCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "Already exists" });
      }

      const result = await wishlistCollection.insertOne(wishlistData);
      res.send(result);
    });

    //get all wishlist by user
    app.get("/wishlist/properties/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;
      const query = { userEmail: userEmail, status: { $exists: false } };
      const result = await wishlistCollection.find(query).toArray();
      res.send(result);
    });

    //get wishlist by email for property bought
    app.get(
      "/user/wishlist/properties/:email",
      verifyToken,
      async (req, res) => {
        const userEmail = req.params.email;
        const query = { userEmail: userEmail, status: { $exists: true } };
        const result = await wishlistCollection.find(query).toArray();
        res.send(result);
      }
    );

    //fetch single wishlist by id
    app.get("/wishlist/single-property/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await wishlistCollection.findOne(query);
      res.send(result);
    });
    //update wishlist after make an offer
    app.put(
      "/wishlist/single-property/update/:id",
      verifyToken,
      async (req, res) => {
        const id = req.params.id;
        const updatedData = req.body;
        const query = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            ...updatedData,
          },
        };
        const result = await wishlistCollection.updateOne(query, updateDoc,options);
        res.send(result);
      }
    );

    //delete wishlist data /
    app.delete(
      "/wishlist/single-property/delete/:id",
      verifyToken,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await wishlistCollection.deleteOne(query);
        res.send(result);
      }
    );

    //post a review
    app.post("/property/add-review", verifyToken, async (req, res) => {
      const reviewData = req.body;
      const result = await reviewsCollection.insertOne(reviewData);
      res.send(result);
    });
    //get all user's review for admin
    app.get("/all-user/review",verifyToken, async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    })
    //get a review by oldId
    app.get("/property/get-review/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { oldId: id };
      const result = await reviewsCollection.find(query).toArray();
      res.send(result);
    }); 
    //get a review by user email
    app.get(
      "/property/user/get-review/:email",
      verifyToken,
      async (req, res) => {
        const email = req.params.email;
        const query = { userEmail: email };
        const result = await reviewsCollection.find(query).toArray();
        res.send(result);
      }
    );
   

    //delete a property review by user email
    app.delete(
      "/property/user/delete-review/:id",
      verifyToken,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await reviewsCollection.deleteOne(query);
        res.send(result);
      }
    );

    //For Agent
    // Save a room in database
    app.post("/add-property", verifyToken, verifyAgent, async (req, res) => {
      const propertyData = req.body;
      const result = await propertiesCollection.insertOne(propertyData);
      res.send(result);
    });
    //find a property which a agent adds
    app.get(
      "/added-property/:email",
      verifyToken,
      verifyAgent,
      async (req, res) => {
        const agentEmail = req.params.email;
        const result = await propertiesCollection
          .find({ agentEmail })
          .toArray();
        res.send(result);
      }
    );
    //Delete a property which a agent adds
    app.delete(
      "/delete-property/:id",
      verifyToken,
      verifyAgent,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await propertiesCollection.deleteOne(query);
        res.send(result);
      }
    );

    //update a property
    app.put(
      "/update-property/:id",
      verifyToken,
      verifyAgent,
      async (req, res) => {
        const id = req.params.id;
        const updatedData = req.body;
        const query = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            ...updatedData,
          },
        };
        const result = await propertiesCollection.updateOne(
          query,
          updateDoc,
          options
        );
        res.send(result);
      }
    );

    // get all offered wishlist
  app.get(
      "/wishlist/requested-properties/:email",
      verifyToken,
      verifyAgent,
      async (req, res) => {
        const email = req.params.email;
        const query = { agentEmail:email ,status: { $exists: true }};
        const result = await wishlistCollection.find(query).toArray();
        res.send(result);
      }
    );

    //change requested properties status
    app.patch(
      "/wishlist/properties/:id",
      verifyToken,
      verifyAgent,
      async (req, res) => {
        const id = req.params.id;
        const updatedData = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: updatedData.status,
          },
        };
        const result = await wishlistCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );
    //total sold amount by agent email
    app.get("/agent-sale/:email",verifyToken,verifyAgent, async (req, res) => {
      const email = req.params.email;
      const query = { agentEmail: email };
        const bookingsDetails = await bookingsCollection
          .find(query, { projection: { offerPrice: 1} })
          .toArray();
       
         const totalSale = bookingsDetails.reduce(
          (sum, data) => sum + Number((data.offerPrice)),
          0
        ); 
      res.json( totalSale );
        })
    // For Admin
    // Get all users
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    //update user role
    app.patch("/users/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const updatedData = req.body;
      const query = { email: email };
      const updateDoc = {
        $set: {
          role: updatedData.status,
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      //if agent is fraud
      const query2 = { agentEmail: email };
      await propertiesCollection.updateOne(query2, updateDoc)
      res.send(result);
    });
    //delete user
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
    //update property verification status
    app.patch(
      "/properties/update/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const updatedData = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            ...updatedData,
          },
        };
        const result = await propertiesCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );
    // Booking/Payment
    // Generate client secret for stripe payment
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      if (!price || amount < 1) return;
      const { client_secret } = await stripe.paymentIntents.create({
        amount: amount,
        // currency: "usd",
        currency: "inr",
        // https://stripe.com/docs/api/payment_intents
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: client_secret });
    });

    // Save booking info in booking collection
    app.post("/bookings", verifyToken, async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });
    // Update room booking status
    app.patch("/booking/status/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: data.status,
        },
      };
      const result = await wishlistCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Get all bookings for user
    app.get("/bookings/user", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (!email) return res.send([]);
      const query = { userEmail: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });
    // Get all bookings for agent
    app.get("/bookings/agent", verifyToken, verifyAgent, async (req, res) => {
      const email = req.query.email;
      if (!email) return res.send([]);
      const query = { agentEmail: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });


 // Update property by admin for adv
 app.patch("/update/property/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  const data = req.body;
  const query = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: {
      adv: data.adv,
    },
  };
  const result = await propertiesCollection.updateOne(query, updateDoc);
  res.send(result);
});



    // Send a ping to confirm a successful connection
    client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`🏡 Real Estate App is live and thriving on port ${port}! 🌟`);
});
