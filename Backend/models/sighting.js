// Load required packages
var mongoose = require('mongoose');

// Define our task schema
var SightingSchema = new mongoose.Schema({
    species: { type: String, required: [true, "species is required"] },
    description: { type: String, default: "" },
    sightingUser: { type: String, default: "" },
    dateCreated: { type: Date, default: Date.now },

    // Image stored as a URL
    image: { type: String, default: "" },
    
    // Location stored as GeoJSON Point for geospatial queries
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // Format: [longitude, latitude]
            required: [true, "Coordinates are required"]
        },
        placeName: { type: String, default: "" } // Optional human-readable label
    }
});

// Export the Mongoose model
const sightingsConn = mongoose.connections[1];
module.exports = sightingsConn.model('Sighting', SightingSchema);