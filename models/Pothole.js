// models/Pothole.js
const mongoose = require('mongoose');

const potholeSchema = new mongoose.Schema({
    location: {
        type: {
            type: String,
            enum: ['Point'],
            required: true,
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true,
            validate: {
                validator: function (coords) {
                    return coords.length === 2 &&
                        coords[0] >= -180 && coords[0] <= 180 && // longitude
                        coords[1] >= -90 && coords[1] <= 90;     // latitude
                },
                message: 'Invalid coordinates. Must be [longitude, latitude] within valid ranges.'
            }
        }
    },
    intensity: {
        type: Number,
        required: true,
        min: 0,
        max: 10,
        validate: {
            validator: function (value) {
                return value >= 0 && value <= 10;
            },
            message: 'Intensity must be between 0 and 10'
        }
    },
    reports: {
        type: Number,
        default: 1,
        min: 1
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true // Adds createdAt and updatedAt automatically
});

// Create 2dsphere index for geospatial queries
potholeSchema.index({ location: '2dsphere' });

// Instance method to check if coordinates are within radius
potholeSchema.methods.isNear = function (longitude, latitude, radiusInMeters) {
    const earthRadiusInMeters = 6371000;
    const lat1 = this.location.coordinates[1];
    const lon1 = this.location.coordinates[0];
    const lat2 = latitude;
    const lon2 = longitude;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = earthRadiusInMeters * c;

    return distance <= radiusInMeters;
};

// Static method to find potholes near a location
potholeSchema.statics.findNear = async function (longitude, latitude, maxDistanceInMeters) {
    return this.find({
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                },
                $maxDistance: maxDistanceInMeters
            }
        }
    });
};

// Static method to find potholes in bounding box
potholeSchema.statics.findInBoundingBox = async function (minLat, maxLat, minLng, maxLng) {
    return this.find({
        location: {
            $geoWithin: {
                $box: [
                    [minLng, minLat], // bottom-left corner
                    [maxLng, maxLat]  // top-right corner
                ]
            }
        }
    });
};

const Pothole = mongoose.model('Pothole', potholeSchema);

module.exports = Pothole;