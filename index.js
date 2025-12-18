const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);


app.use(cors());
app.use(express.json());

// verified token
const verifyFBToken = async (req, res, next) => {
  const token = req.headers?.authorization;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access!" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    req.decoded_email = decoded?.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "unauthorized access!" });
  }
};

// firebase admin
const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ecxm2rv.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    const db = client.db("garments-user");
    const productsCollection = db.collection("products");
    const usersCollection = db.collection("user");
    const ordersCollection = db.collection("orders");

    // TopProducts APIs

    app.get("/topProducts", async (req, res) => {
      const query = { showOnHomePage: true };
      const cursor = productsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

// AllProducts
    app.post("/products", verifyFBToken, async (req, res) => {
      const newProduct = req.body;
      newProduct.showOnHomePage = false;
      newProduct.sellerEmail = req.decoded_email;
      const result = await productsCollection.insertOne(newProduct);
      res.send({ insertedId: result.insertedId });
    });

// products
    app.patch("/products/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const updatedProduct = req.body;
      const product = await productsCollection.findOne({
        $or: [{ _id: id }, { _id: new ObjectId(id) }],
      });
      if (!updatedProduct) {
        return res.status(400).send({ message: "Invalid product data" });
      }
      const user = await usersCollection.findOne({ email: req.decoded_email });
      if (product?.sellerEmail !== req.decoded_email && user?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden: You can only update your own products" });
      }

      const {
        title,
        category,
        price,
        productDescription,
        demoVideoLink,
        availableQuantity,
        minimumOrderQuantity,
        paymentOptions,
        images,
      } = updatedProduct;
      const query = {
        $or: [{ _id: id }, { _id: new ObjectId(id) }],
      };
      const updatedDoc = {
        $set: {
          title,
          category,
          price,
          availableQuantity,
          minimumOrderQuantity,
          paymentOptions,
          productDescription,
          demoVideoLink,
          images: images || [],
          updatedAt: new Date(),
        },
      };
      const result = await productsCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // products HomePage

    app.patch("/products/:id/showOnHome", async (req, res) => {
      const id = req.params.id;
      const { showOnHomePage } = req.body;
      const query = {
        $or: [{ _id: id }, { _id: new ObjectId(id) }],
      };
      const updatedDoc = {
        $set: {
          showOnHomePage,
        },
      };
      const result = await productsCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

// products
    app.get("/products", async (req, res) => {
      const { limit = 0, skip = 0, email } = req.query;
      const query = {};
      if (email) {
        query.sellerEmail = email;
      }
      const cursor = productsCollection.find(query).limit(Number(limit)).skip(Number(skip));
      const result = await cursor.toArray();
      res.send(result);
    });

// products 
    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      let result = null;
      if (ObjectId.isValid(id)) {
        result = await productsCollection.findOne({ _id: new ObjectId(id) });
      }
      if (!result) {
        result = await productsCollection.findOne({ _id: id });
      }
      res.send(result);
    });


// productsCount
    app.get("/productsCount", async (req, res) => {
      const count = await productsCollection.estimatedDocumentCount();
      res.send({ count });
    });

// products delete
    app.delete("/products/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const product = await productsCollection.findOne({
        $or: [{ _id: id }, { _id: new ObjectId(id) }],
      });
      if (!product) {
        return res.status(404).send({ message: "Product not found" });
      }
      const user = await usersCollection.findOne({ email: req.decoded_email });
      if (product.sellerEmail !== req.decoded_email && user?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden: You can only delete your own products" });
      }
      const query = {
        $or: [{ _id: id }, { _id: new ObjectId(id) }],
      };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });



    // Users Apis
    app.get("/users", verifyFBToken, async (req, res) => {
      const user = await usersCollection.findOne({ email: req.decoded_email });
      if (user?.role !== "admin") {
        const currentUser = await usersCollection.findOne({ email: req.decoded_email });
        return res.send(currentUser);
      }
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
        const result = await usersCollection.findOne(query);
        return res.send(result);
      }
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

// post users
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.joinDate = new Date();
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

// patch users id
    app.patch("/users/:id", verifyFBToken, async (req, res) => {
      const user = await usersCollection.findOne({ email: req.decoded_email });
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden: Only admin can approve users" });
      }
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "approved",
          updatedAt: new Date(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });


    // patch users role
    app.patch("/users/:id/role", verifyFBToken, async (req, res) => {
      const adminUser = await usersCollection.findOne({ email: req.decoded_email });
      if (adminUser?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden: Only admin can change user roles" });
      }
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
          status: "approved",
          updatedAt: new Date(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });


    // user suspension apis
    app.patch("/users/:id/suspension", async (req, res) => {
      const id = req.params.id;
      const { status, suspendReason } = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status,
          suspendReason,
          updatedAt: new Date(),
        },
      };
      const result = await usersCollection.updateOne(query, updatedDoc);
      res.send(result);
    });


    // Orders related apis
    app.get("/orders", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email;
        const query = {};
        if (email) {
          query.buyerEmail = email;
          if (email !== req.decoded_email) {
            return res.status(403).send({ message: "forbidden access!" });
          }
        }
        const orders = await ordersCollection.find(query).toArray();
        const ordersWithProductInfo = await Promise.all(
          orders.map(async (order) => {
            let productTitle = "";
            let paymentMethod = "";
            if (order.productId) {
              const productQuery = {
                $or: [{ _id: order.productId }, { _id: new ObjectId(order.productId) }],
              };
              const product = await productsCollection.findOne(productQuery);
              if (product) {
                productTitle = product.title || "";
                paymentMethod = product.paymentOptions || "";
              }
            }
            return {
              ...order,
              productTitle,
              paymentMethod,
            };
          })
        );
        res.send(ordersWithProductInfo);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error while fetching orders" });
      }
    });

    //orders details apis
    app.get("/orders/:orderId", async (req, res) => {
      const id = req.params.orderId;
      const query = { _id: new ObjectId(id) };
      const result = await ordersCollection.findOne(query);
      res.send(result);
    });

    // post orders
    app.post("/orders", async (req, res) => {
      const order = req.body;
      order.paymentStatus = "Pending";
      order.status = "Pending";
      order.transactionId = null;
      order.trackingId = null;
      order.orderDate = new Date();
      order.trackingHistory = [
        {
          entryDate: order.orderDate,
          orderStatus: "Order Placed",
        },
      ];
      const result = await ordersCollection.insertOne(order);
      res.send({ insertedId: result.insertedId });
    });


// orders patch apis
    app.patch("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const { status, location, note } = req.body;
      const query = { _id: new ObjectId(id) };
      const generateTrackingId = () => {
        const trackingBase = uuidv4().split("-")[0];
        return `GT-${trackingBase.toUpperCase()}`;
      };
      const newTrackingEntry = {
        entryDate: new Date(),
        orderStatus: status,
        location: location || "",
        note: note || "",
      };
      if (status === "Delivered") {
        const updatedDoc = {
          $push: { trackingHistory: newTrackingEntry },
          $set: {
            status: status,
            updatedAt: new Date(),
          },
        };
        const result = await ordersCollection.updateOne(query, updatedDoc);
        return res.send(result);
      }
      if (status === "Approved") {
        const order = await ordersCollection.findOne(query);
        if (!order) {
          return res.status(404).send({ message: "Order not found" });
        }
        const productQuery = {
          $or: [{ _id: order.productId }, { _id: new ObjectId(order.productId) }],
        };
        const product = await productsCollection.findOne(productQuery);
        if (!product) {
          return res.status(404).send({ message: "Product not found" });
        }
        const orderQuantity = parseInt(order.quantity);
        const currentAvailableQuantity = parseInt(product.availableQuantity);
        if (currentAvailableQuantity < orderQuantity) {
          return res.status(400).send({
            message: `Insufficient stock. Available: ${currentAvailableQuantity}, Ordered: ${orderQuantity}`,
          });
        }
        const newAvailableQuantity = currentAvailableQuantity - orderQuantity;
        const productUpdateResult = await productsCollection.updateOne(productQuery, {
          $set: {
            availableQuantity: newAvailableQuantity,
            updatedAt: new Date(),
          },
        });
        const orderUpdatedDoc = {
          $push: { trackingHistory: newTrackingEntry },
          $set: {
            status: status,
            updatedAt: new Date(),
            trackingId: generateTrackingId(),
          },
        };
        const orderUpdateResult = await ordersCollection.updateOne(query, orderUpdatedDoc);
        res.send({
          ...orderUpdateResult,
          productUpdated: productUpdateResult.modifiedCount > 0,
        });
      }
      if (status === "Rejected") {
        const updatedDoc = {
          $push: { trackingHistory: newTrackingEntry },
          $set: {
            status: status,
            updatedAt: new Date(),
            trackingId: null,
          },
        };
        const result = await ordersCollection.updateOne(query, updatedDoc);
        return res.send(result);
      }
      const updatedDoc = {
        $push: { trackingHistory: newTrackingEntry },
        $set: {
          updatedAt: new Date(),
        },
      };
      const result = await ordersCollection.updateOne(query, updatedDoc);
      res.send(result);
    });


    // delete orders/myOrders
    app.delete("/orders/:id/my-order", async (req, res) => {
      const orderId = req.params.id;
      const query = { _id: new ObjectId(orderId) };
      const result = await ordersCollection.deleteOne(query);
      if (result.deletedCount > 0) {
        return res.send({ success: true, message: "Pending order deleted" });
      }
      res.send({ success: false, message: "Order not found or cannot delete" });
    });

// delete order
    app.delete("/orders/:id", async (req, res) => {
      const orderId = req.params.id;
      try {
        const result = await ordersCollection.deleteOne({
          _id: new ObjectId(orderId),
          paymentStatus: "Pending",
          paymentMethod: "Stripe",
        });
        if (result.deletedCount > 0) {
          return res.send({ success: true, message: "Pending order deleted" });
        }
        res.send({ success: false, message: "Order not found or cannot delete" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: "Server error" });
      }
    });


    //payment related apis
    
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const { productId, quantity, productPrice, buyerEmail, productTitle, orderId } = req.body;
        if (!productId || !quantity || !productPrice || !buyerEmail) {
          return res.status(400).send({ error: "Missing required fields" });
        }
        const amount = parseFloat(productPrice) * 100;
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: amount,
                product_data: { name: productTitle || "Product" },
              },
              quantity: parseInt(quantity),
            },
          ],
          mode: "payment",
          customer_email: buyerEmail,
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled?orderId=${orderId}`,
          metadata: {
            productId,
            orderId,
          },
        });

        res.send({ url: session.url });
      } catch (err) {
        console.error("Stripe error:", err);
        res.status(500).send({ error: "Stripe session creation failed" });
      }
    });

    // Verify payment
    app.get("/verify-payment", async (req, res) => {
      const sessionId = req.query.session_id;
      if (!sessionId) return res.status(400).send({ error: "No session_id provided" });
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const orderId = session.metadata.orderId;
        if (session.payment_status === "paid") {
          const trackingId = `TDO-${sessionId}`;
          await ordersCollection.updateOne(
            { _id: new ObjectId(orderId) },
            {
              $set: {
                paymentStatus: "Paid",
                transactionId: session.payment_intent,
                trackingId,
                status: "Approved",
                updatedAt: new Date(),
              },
              $push: {
                trackingHistory: {
                  entryDate: new Date(),
                  orderStatus: "Payment Completed",
                },
              },
            }
          );

          return res.send({ success: true });
        }

        res.send({ success: false });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Payment verification failed" });
      }
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Server site is running successfully!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
