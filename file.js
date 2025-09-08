const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Sequelize, DataTypes } = require("sequelize");

const app = express();
app.use(bodyParser.json());
app.use(cors());

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "ecommerce.sqlite"
});

const User = sequelize.define("User", {
  username: { type: DataTypes.STRING, unique: true },
  password: DataTypes.STRING
});

const Product = sequelize.define("Product", {
  name: DataTypes.STRING,
  description: DataTypes.STRING,
  price: DataTypes.FLOAT
});

const Order = sequelize.define("Order", {
  total: DataTypes.FLOAT
});

const OrderItem = sequelize.define("OrderItem", {
  quantity: DataTypes.INTEGER,
  price: DataTypes.FLOAT
});

User.hasMany(Order);
Order.belongsTo(User);
Order.hasMany(OrderItem);
OrderItem.belongsTo(Order);
OrderItem.belongsTo(Product);

const SECRET = "supersecret";

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, SECRET, {
    expiresIn: "1h"
  });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.sendStatus(401);
  const token = authHeader.split(" ")[1];
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  try {
    const user = await User.create({ username, password: hashed });
    res.json({ message: "User registered", user });
  } catch (err) {
    res.status(400).json({ error: "User already exists" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ where: { username } });
  if (!user) return res.status(400).json({ error: "Invalid username" });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: "Invalid password" });
  res.json({ token: generateToken(user) });
});

app.get("/api/products", async (req, res) => {
  const products = await Product.findAll();
  res.json(products);
});

app.get("/api/products/:id", async (req, res) => {
  const product = await Product.findByPk(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

app.post("/api/orders", authMiddleware, async (req, res) => {
  const { items } = req.body; // [{ productId, quantity }]
  let total = 0;
  const order = await Order.create({ UserId: req.user.id, total: 0 });

  for (let item of items) {
    const product = await Product.findByPk(item.productId);
    if (!product) continue;
    const price = product.price * item.quantity;
    total += price;
    await OrderItem.create({
      OrderId: order.id,
      ProductId: product.id,
      quantity: item.quantity,
      price
    });
  }

  order.total = total;
  await order.save();

  res.json({ message: "Order placed", orderId: order.id, total });
});

app.get("/api/orders", authMiddleware, async (req, res) => {
  const orders = await Order.findAll({
    where: { UserId: req.user.id },
    include: [OrderItem]
  });
  res.json(orders);
});

sequelize.sync({ force: true }).then(async () => {

  await Product.bulkCreate([
    { name: "Laptop", description: "Powerful laptop", price: 999.99 },
    { name: "Phone", description: "Smartphone", price: 599.99 },
    { name: "Headphones", description: "Noise cancelling", price: 199.99 }
  ]);

  app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));
});