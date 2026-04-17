const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

function setupSwagger(app) {
  const options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'SafeRoute API',
        version: '1.0.0',
        description: 'API documentation for SafeRoute backend'
      },
      // Servers: prefer explicit HOSTED_URL, then Render's RENDER_EXTERNAL_URL, otherwise localhost
      servers: [
        { url: process.env.HOSTED_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000', description: 'Primary server (HOSTED_URL or Render fallback)' },
        { url: 'http://localhost:5000', description: 'Local server' }
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        },
        schemas: {
          User: {
            type: 'object',
            required: ['_id', 'createdAt'],
            properties: {
              _id: { type: 'string', description: 'MongoDB ObjectId' },
              name: { type: 'string' },
              email: { type: 'string', nullable: true, format: 'email' },
              phone: { type: 'string', nullable: true },
              authProvider: { type: 'string', example: 'otp' },
              emergencyContacts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { name: { type: 'string' }, phone: { type: 'string' } }
                }
              },
              createdAt: { type: 'string', format: 'date-time' }
            },
            example: {
              _id: '64f1b2c3d4e5f6a7b8c9d012',
              name: 'Jane Doe',
              email: 'jane@example.com',
              phone: '+15551234567',
              authProvider: 'otp',
              emergencyContacts: [{ name: 'John Doe', phone: '+15557654321' }],
              createdAt: '2025-10-09T12:34:56.000Z'
            }
          },
          SafetyScore: {
            type: 'object',
            required: ['areaId', 'score'],
            properties: {
              _id: { type: 'string' },
              areaId: { type: 'string', description: 'Geohash area id' },
              score: { type: 'number', minimum: 0, maximum: 10 },
              factors: {
                type: 'object',
                properties: {
                  lighting: { type: 'number', minimum: 0, maximum: 10 },
                  crowd: { type: 'number', minimum: 0, maximum: 10 },
                  police: { type: 'number', minimum: 0, maximum: 10 },
                  hospital: { type: 'number', minimum: 0, maximum: 10 },
                  incidents: { type: 'number', minimum: 0, maximum: 10 },
                  accidents: { type: 'number', minimum: 0, maximum: 10 }
                }
              },
              nearestPolice: {
                type: 'object',
                description: 'Minimal reference to nearest police POI; use /api/police/{placeId} to fetch details',
                properties: {
                  placeId: { type: 'string' },
                  distance_m: { type: 'number' }
                }
              },
              nearestHospital: {
                type: 'object',
                description: 'Minimal reference to nearest hospital POI; use /api/hospital/{placeId} to fetch details',
                properties: {
                  placeId: { type: 'string' },
                  distance_m: { type: 'number' }
                }
              },
              lastUpdated: { type: 'string', format: 'date-time' }
            },
            example: {
              _id: '64f1b2c3d4e5f6a7b8c9d999',
              areaId: 'dr5regw',
              score: 6.5,
              factors: { lighting: 7, crowd: 6, police: 5, hospital: 8, incidents: 4, accidents: 3 },
              nearestPolice: { placeId: 'ChI...', distance_m: 320 },
              nearestHospital: { placeId: 'ChH...', distance_m: 500 },
              lastUpdated: '2025-10-09T12:00:00.000Z'
            }
          },
          Hospital: {
            type: 'object',
            properties: {
              _id: { type: 'string' },
              placeId: { type: 'string' },
              name: { type: 'string' },
              address: { type: 'string' },
              phone: { type: 'string' },
              location: {
                type: 'object',
                properties: {
                  geohash: { type: 'string' },
                  geo: { type: 'object', properties: { type: { type: 'string' }, coordinates: { type: 'array', items: { type: 'number' } } } }
                }
              },
              lastUpdated: { type: 'string', format: 'date-time' }
            },
            example: {
              placeId: 'ChH...',
              name: 'City Hospital',
              address: 'Main road, Ahmedabad',
              phone: '+91 79 1234 5678',
              location: { geohash: 'ts5em1z', geo: { type: 'Point', coordinates: [72.5978149, 23.0262505] } },
              lastUpdated: '2025-10-12T10:00:00.000Z'
            }
          },
          PoliceStation: {
            type: 'object',
            properties: {
              _id: { type: 'string' },
              placeId: { type: 'string' },
              name: { type: 'string' },
              address: { type: 'string' },
              phone: { type: 'string' },
              location: {
                type: 'object',
                properties: {
                  geohash: { type: 'string' },
                  geohash: { type: 'string' },
                  geo: { type: 'object', properties: { type: { type: 'string' }, coordinates: { type: 'array', items: { type: 'number' } } } }
                }
              },
              lastUpdated: { type: 'string', format: 'date-time' }
            },
            example: {
              placeId: 'ChI...',
              name: 'Ahmedabad City Police Force',
              address: 'Rambaug road, Maninagar, Ahmedabad',
              phone: '+91 79 2546 0089',
              location: { geohash: 'ts5em1y', geo: { type: 'Point', coordinates: [72.5978149, 23.0262505] } },
              lastUpdated: '2025-10-12T10:00:00.000Z'
            }
          },
          PoliceStationList: {
            type: 'object',
            properties: {
              count: { type: 'integer' },
              stations: { type: 'array', items: { $ref: '#/components/schemas/PoliceStation' } }
            }
          },
          GeoJSONFeature: {
            type: 'object',
            properties: {
              type: { type: 'string', example: 'Feature' },
              geometry: { type: 'object' },
              properties: { type: 'object' }
            }
          },
          GeoJSONFeatureCollection: {
            type: 'object',
            properties: {
              type: { type: 'string', example: 'FeatureCollection' },
              features: { type: 'array', items: { $ref: '#/components/schemas/GeoJSONFeature' } }
            }
          },
          MapNearestResponse: {
            type: 'object',
            properties: {
              processed: { type: 'integer' },
              updated: { type: 'integer' },
              results: { type: 'array', items: { type: 'object' } }
            }
          },
          Route: {
            type: 'object',
            required: ['polyline', 'safety_score'],
            properties: {
              summary: { type: 'string' },
              polyline: { type: 'string' },
              distance: { type: 'object', description: 'Google distance object { text, value }' },
              duration: { type: 'object', description: 'Google duration object { text, value }' },
              decoded_point_count: { type: 'integer' },
              areaIds: { type: 'array', items: { type: 'string' }, description: 'Geohash area ids sampled along the route' },
              created_cells_count: { type: 'integer', description: 'Number of SafetyScore cells created during this request' },
              created_cells: { type: 'array', items: { type: 'string' }, description: 'List of created areaIds (first 50)' },
              safety_score: { type: 'number', description: 'Final safety score including pothole penalty' },
              safety_score_excluding_potholes: { type: 'number', description: 'Base safety score before pothole penalty' },
              safety_score_including_potholes: { type: 'number', description: 'Safety score after pothole penalty' },
              pothole_count: { type: 'integer', description: 'Total potholes detected along route' },
              pothole_intensity: { type: 'number', description: 'Pothole intensity across route = pothole_count / route_distance_km' },
              pothole_penalty: { type: 'number', description: 'Penalty deducted from base score due to potholes' },
              comparative_analysis: {
                type: 'object',
                properties: {
                  score_excluding_potholes: { type: 'number' },
                  score_including_potholes: { type: 'number' },
                  pothole_intensity: { type: 'number' },
                  pothole_penalty: { type: 'number' },
                  score_drop_percent: { type: 'number', description: 'Percent drop from base score because of potholes' }
                }
              },
              additional_comparisons: {
                type: 'object',
                description: 'Present on safest route',
                properties: {
                  safer_than_fastest_percent: { type: 'number' },
                  safer_than_shortest_percent: { type: 'number' }
                }
              },
              color: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' }, description: "Route tags such as 'safest','fastest','shortest'" }
            },
            example: {
              summary: 'I-90 W',
              polyline: 'abcd1234encoded',
              distance: { text: '5.4 km', value: 5400 },
              duration: { text: '12 mins', value: 720 },
              decoded_point_count: 120,
              areaIds: ['dr5regw', 'dr5regx'],
              created_cells_count: 0,
              created_cells: [],
              safety_score: 6.85,
              safety_score_excluding_potholes: 7.2,
              safety_score_including_potholes: 6.85,
              pothole_count: 2,
              pothole_intensity: 0.37,
              pothole_penalty: 0.35,
              comparative_analysis: {
                score_excluding_potholes: 7.2,
                score_including_potholes: 6.85,
                pothole_intensity: 0.37,
                pothole_penalty: 0.35,
                score_drop_percent: 4.86
              },
              additional_comparisons: {
                safer_than_fastest_percent: 11.2,
                safer_than_shortest_percent: 8.4
              },
              color: 'green',
              tags: ['safest']
            }
          },
          RecentRoute: {
            type: 'object',
            properties: {
              origin: { type: 'string' },
              destination: { type: 'string' },
              distance: { type: 'string' },
              duration: { type: 'string' },
              safety: { type: 'number' },
              tags: { type: 'array', items: { type: 'string' } },
              createdAt: { type: 'string', format: 'date-time' }
            },
            example: {
              origin: '23.022500,72.571400',
              destination: '23.038120,72.556830',
              distance: '5.4 km',
              duration: '12 mins',
              safety: 6.85,
              tags: ['safest'],
              createdAt: '2026-02-27T10:30:00.000Z'
            }
          },
          Report: {
            type: 'object',
            required: ['type', 'location'],
            properties: {
              _id: { type: 'string' },
              user: { type: 'string' },
              type: { type: 'string', enum: ['harassment', 'theft', 'accident', 'dark_area', 'suspicious_activity'] },
              description: { type: 'string' },
              location: {
                type: 'object',
                required: ['lat', 'lng'],
                properties: { lat: { type: 'number' }, lng: { type: 'number' } }
              },
              severity: { type: 'number', minimum: 1, maximum: 5 },
              createdAt: { type: 'string', format: 'date-time' }
            },
            example: {
              _id: '64f1b2c3d4e5f6a7b8c90001',
              user: '64f1b2c3d4e5f6a7b8c90000',
              type: 'dark_area',
              description: 'Poorly lit alley behind the store',
              location: { lat: 40.7128, lng: -74.0060 },
              severity: 3,
              createdAt: '2025-10-09T11:22:33.000Z'
            }
          },
          SOSLog: {
            type: 'object',
            required: ['user', 'status', 'createdAt'],
            properties: {
              _id: { type: 'string' },
              user: { type: 'string' },
              location: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
              contactsNotified: { type: 'array', items: { type: 'string' } },
              status: { type: 'string', enum: ['triggered', 'sent', 'resolved'] },
              createdAt: { type: 'string', format: 'date-time' }
            },
            example: {
              _id: '64f1b2c3d4e5f6a7b8c90011',
              user: '64f1b2c3d4e5f6a7b8c90000',
              location: { lat: 40.7128, lng: -74.0060 },
              contactsNotified: ['+15551234567'],
              status: 'triggered',
              createdAt: '2025-10-09T12:34:56.000Z'
            }
          },
          Error: { type: 'object', properties: { error: { type: 'string' } } }
          ,
          AuthResponse: {
            type: 'object',
            properties: {
              token: { type: 'string' },
              user: { $ref: '#/components/schemas/User' }
            },
            example: {
              token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              user: { _id: '64f1b2c3d4e5f6a7b8c9d012', name: 'Jane Doe', email: 'jane@example.com' }
            }
          },
          PredictSeverityRequest: {
            type: 'object',
            properties: {
              acceleration: { type: 'array', items: { type: 'number' }, description: 'Acceleration data points' },
              gyroscope: { type: 'array', items: { type: 'number' }, description: 'Gyroscope data points' },
              speed: { type: 'number', description: 'Speed of the vehicle' }
            },
            required: ['acceleration', 'gyroscope', 'speed'],
            example: {
              acceleration: [0.1, 0.2, 0.3],
              gyroscope: [0.01, 0.02, 0.03],
              speed: 45.5
            }
          },
          PredictSeverityResponse: {
            type: 'object',
            properties: {
              severity: { type: 'number', description: 'Predicted severity score (0-10)' }
            },
            example: {
              severity: 7.5
            }
          },
          CompareModelsResponse: {
            type: 'object',
            properties: {
              lstm: {
                type: 'object',
                properties: {
                  accuracy: { type: 'number' },
                  precision: { type: 'number' },
                  recall: { type: 'number' },
                  f1: { type: 'number' }
                }
              },
              xgboost: {
                type: 'object',
                properties: {
                  accuracy: { type: 'number' },
                  precision: { type: 'number' },
                  recall: { type: 'number' },
                  f1: { type: 'number' }
                }
              }
            },
            example: {
              lstm: {
                accuracy: 0.92,
                precision: 0.89,
                recall: 0.91,
                f1: 0.90
              },
              xgboost: {
                accuracy: 0.88,
                precision: 0.85,
                recall: 0.87,
                f1: 0.86
              }
            }
          },
          GetWeightsResponse: {
            type: 'object',
            properties: {
              lighting: { type: 'number' },
              crowd: { type: 'number' },
              police: { type: 'number' },
              hospital: { type: 'number' },
              potholes: { type: 'number' },
              incidents: { type: 'number' },
              accidents: { type: 'number' }
            },
            example: {
              lighting: 0.20,
              crowd: 0.15,
              police: 0.20,
              hospital: 0.20,
              potholes: 0.10,
              incidents: 0.15,
              accidents: 0.10
            }
          }
        }
      }
    },
    apis: ['./routes/*.js'],
    // Add explicit paths for the unified routes compare endpoint
    paths: {
      '/api/routes/compare': {
        post: {
          summary: 'Compare routes between origin and destination (unified)',
          tags: ['Routes'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['origin', 'destination'],
                  properties: {
                    origin: {
                      oneOf: [
                        { type: 'string', description: 'Origin address or lat,lng' },
                        {
                          type: 'object',
                          properties: {
                            lat: { type: 'number' },
                            lng: { type: 'number' },
                            name: { type: 'string', description: 'Optional human-readable label' }
                          }
                        }
                      ]
                    },
                    destination: {
                      oneOf: [
                        { type: 'string', description: 'Destination address or lat,lng' },
                        {
                          type: 'object',
                          properties: {
                            lat: { type: 'number' },
                            lng: { type: 'number' },
                            name: { type: 'string', description: 'Optional human-readable label' }
                          }
                        }
                      ]
                    },
                    single: { type: 'boolean', description: 'Return a single preferred route' },
                    prefer: { type: 'string', description: "Preferred selector: 'safest'|'fastest'|'shortest'" }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'List of alternative routes or a single route when single=true',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      routes: { type: 'array', items: { $ref: '#/components/schemas/Route' } },
                      route: { $ref: '#/components/schemas/Route' }
                    }
                  }
                }
              }
            },
            '400': { description: 'Missing origin/destination', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '404': { description: 'No routes found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        },
        get: {
          summary: 'GET alias for compare (origin/destination in query)',
          tags: ['Routes'],
          parameters: [
            { name: 'origin', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'destination', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'single', in: 'query', required: false, schema: { type: 'boolean' } },
            { name: 'prefer', in: 'query', required: false, schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: 'Success', content: { 'application/json': { schema: { type: 'object', properties: { routes: { type: 'array', items: { $ref: '#/components/schemas/Route' } }, route: { $ref: '#/components/schemas/Route' } } } } } },
            '400': { description: 'Missing origin/destination', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '404': { description: 'No routes found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        }
      },
      '/api/routes/recent': {
        get: {
          summary: 'Get recent route searches for current user',
          tags: ['Routes'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Recent route searches for authenticated user',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      recentRoutes: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/RecentRoute' }
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Missing/invalid token',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
            },
            '500': {
              description: 'Server error',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
            }
          }
        }
      },
      '/api/ml/predict-severity': {
        post: {
          summary: 'Predict pothole severity',
          description: 'Predict the severity of a pothole event based on sensor data.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PredictSeverityRequest'
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Predicted severity score',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/PredictSeverityResponse'
                  }
                }
              }
            },
            400: {
              description: 'Invalid input data'
            }
          }
        }
      },
      '/api/ml/compare-models': {
        post: {
          summary: 'Compare ML models',
          description: 'Compare the performance of LSTM and XGBoost models on a given dataset.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    dataset: { type: 'string', description: 'Path to the dataset file' }
                  },
                  required: ['dataset']
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Comparison metrics for both models',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/CompareModelsResponse'
                  }
                }
              }
            },
            400: {
              description: 'Invalid dataset path or format'
            }
          }
        }
      },
      '/api/ml/get-weights': {
        get: {
          summary: 'Get safety factor weights',
          description: 'Retrieve the weights used for safety factor calculations.',
          responses: {
            200: {
              description: 'Safety factor weights',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/GetWeightsResponse'
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  const spec = swaggerJsdoc(options);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
}

module.exports = setupSwagger;
