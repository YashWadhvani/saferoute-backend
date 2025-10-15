require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require('morgan');

const authRoutes = require("./routes/authRoutes");
const safetyRoutes = require("./routes/safetyRoutes");
const routeRoutes = require("./routes/routeRoutes");
const userRoutes = require("./routes/userRoutes");
const reportRoutes = require("./routes/reportRoutes");
const sosRoutes = require("./routes/sosRoutes");
const policeStationRoutes = require("./routes/policeStationRoutes");

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
const path = require('path');
// serve docs map and use map.html as the directory index so /map/ works
app.use('/map', express.static(path.join(__dirname, 'docs'), { index: 'map.html' }));

const setupSwagger = require('./swagger');
setupSwagger(app);

mongoose.connect(process.env.MONGO_URI)
  .then(()=> console.log("✅ MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

app.use("/api/auth", authRoutes);
app.use("/api/safety", safetyRoutes);
app.use("/api/routes", routeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/police', policeStationRoutes);

app.get("/", (req,res)=> res.send("SafeRoute Backend OK"));
const PORT = process.env.PORT || 5000;
app.listen(PORT,'0.0.0.0', ()=> console.log(`🚀 Server running on ${PORT}`));
