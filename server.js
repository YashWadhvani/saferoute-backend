require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require('morgan');

const authRoutes = require("./routes/authRoutes");
const safetyRoutes = require("./routes/safetyRoutes");
const routeRoutes = require("./routes/routeRoutes");

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

// --- Swagger setup ---
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SafeRoute API',
      version: '1.0.0',
      description: 'API documentation for SafeRoute backend'
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Local server' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            email: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        SafetyScore: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            areaId: { type: 'string' },
            score: { type: 'number' },
            factors: {
              type: 'object',
              properties: {
                lighting: { type: 'number' },
                crowd: { type: 'number' },
                police: { type: 'number' },
                incidents: { type: 'number' },
                accidents: { type: 'number' }
              }
            },
            lastUpdated: { type: 'string', format: 'date-time' }
          }
        },
        Route: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            polyline: { type: 'string' },
            distance: { type: 'object' },
            duration: { type: 'object' },
            safety_score: { type: ['number', 'string'] },
            color: { type: 'string' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  },
  // scan the routes folder for JSDoc comments
  apis: ['./routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// --- end Swagger setup ---

mongoose.connect(process.env.MONGO_URI)
  .then(()=> console.log("✅ MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

app.use("/api/auth", authRoutes);
app.use("/api/safety", safetyRoutes);
app.use("/api/routes", routeRoutes);

app.get("/", (req,res)=> res.send("SafeRoute Backend OK"));
const PORT = process.env.PORT || 5000;
app.listen(PORT, ()=> console.log(`🚀 Server running on ${PORT}`));
