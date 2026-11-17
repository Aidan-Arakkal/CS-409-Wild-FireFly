module.exports = function (router) {
    const multer = require('multer');
    const cloudinary = require('cloudinary').v2;
    const mongoose = require('mongoose');
    const User = require("../models/user.js");
    const Sighting = require("../models/sighting.js");

    // 1. Configure Cloudinary
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });

    // 2. Configure Multer to hold the file in RAM briefly (no disk writes)
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 } // 10MB max limit
    });

    // 3. Helper function to stream the buffer to Cloudinary
    const uploadToCloudinary = (fileBuffer) => {
        return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: 'sightings' },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            stream.end(fileBuffer);
        });
    };

    // 4. Helper to extract Cloudinary public_id from a URL and delete it
    const deleteFromCloudinary = async (imageUrl) => {
        if (!imageUrl || !imageUrl.includes("res.cloudinary.com")) return;

        try {
            const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
            if (match && match[1]) {
                const publicId = decodeURIComponent(match[1]);
                await cloudinary.uploader.destroy(publicId);
            }
        } catch (err) {
            console.error("Failed to delete image from Cloudinary:", err);
        }
    };

    // Helper: Normalize sightingUser (treats null, undefined, or whitespace as "")
    const normalizeUserId = (val) => {
        if (val === null || val === undefined) return "";
        return String(val).trim();
    };

    // Helper: Build a Sighting payload from either JSON or FormData (multipart)
    const buildSightingData = (body, existingImageUrl = "", existingUserId = "") => {
        // On PUT, preserve existingUserId if sightingUser is omitted; clear it if sent as "" or null
        const resolvedUser = body.sightingUser !== undefined
            ? normalizeUserId(body.sightingUser)
            : normalizeUserId(existingUserId);

        const data = {
            species: body.species,
            description: body.description !== undefined ? body.description : "",
            sightingUser: resolvedUser,
            image: existingImageUrl
        };

        if (body.location && typeof body.location === "object") {
            data.location = body.location;
        } else if (typeof body.location === "string") {
            try {
                data.location = JSON.parse(body.location);
            } catch (_) {
                // Leave undefined so Mongoose validation catches malformed location
            }
        } else if (body.longitude !== undefined && body.latitude !== undefined) {
            const lng = parseFloat(body.longitude);
            const lat = parseFloat(body.latitude);
            if (!isNaN(lng) && !isNaN(lat)) {
                data.location = {
                    type: "Point",
                    coordinates: [lng, lat],
                    placeName: body.placeName || ""
                };
            }
        }

        return data;
    };

    const sightingsRoute = router.route("/sightings");
    const sightingsIdRoute = router.route("/sightings/:id");

    // GET all sightings
    sightingsRoute.get(async function (req, res) {
        const query = Sighting.find();

        try {
            if (req.query["where"]) { query.where(JSON.parse(req.query.where)); }
            if (req.query["sort"]) { query.sort(JSON.parse(req.query.sort)); }
            if (req.query["select"]) { query.select(JSON.parse(req.query.select)); }
            if (req.query["skip"]) { query.skip(Number(req.query.skip)); }
            if (req.query["limit"]) {
                query.limit(Number(req.query.limit));
            } else {
                query.limit(100);
            }
            if (req.query["count"] === "true") {
                const count = await query.countDocuments();
                return res.status(200).json({ message: "Count successfully retrieved", data: count });
            }
        } catch (_) {
            return res.status(400).json({ message: "Error with parsing url parameters/filters", data: [] });
        }

        try {
            const result = await query.exec();
            return res.status(200).json({ message: "Data successfully retrieved", data: result });
        } catch (_) {
            return res.status(500).json({ message: "Error with the server/database", data: [] });
        }
    });

    // POST a new sighting and link it to User.sightings
    sightingsRoute.post(upload.single('image'), async function (req, res) {
        const incomingUserId = normalizeUserId(req.body.sightingUser);

        if (incomingUserId !== "") {
            if (!mongoose.isValidObjectId(incomingUserId)) {
                return res.status(400).json({ message: "Invalid user id for sightingUser", data: {} });
            }
            const userExists = await User.findById(incomingUserId).exec();
            if (!userExists) {
                return res.status(404).json({ message: "Referenced sightingUser does not exist", data: {} });
            }
        }

        const sightingData = buildSightingData(req.body, req.body.image || "", "");
        const newSighting = new Sighting(sightingData);

        try {
            await newSighting.validate();
        } catch (err) {
            return res.status(400).json({ message: err.message || "New sighting is incorrectly formatted", data: {} });
        }

        if (req.file) {
            try {
                const uploadResult = await uploadToCloudinary(req.file.buffer);
                newSighting.image = uploadResult.secure_url;
            } catch (err) {
                return res.status(500).json({ message: "Failed to upload image to Cloudinary", error: err.message, data: {} });
            }
        }

        const maxAttempts = 5;
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const savedSighting = await newSighting.save();
                const savedUserId = normalizeUserId(savedSighting.sightingUser);

                if (savedUserId !== "" && mongoose.isValidObjectId(savedUserId)) {
                    await User.findByIdAndUpdate(savedUserId, {
                        $addToSet: { sightings: savedSighting._id.toString() }
                    }).exec();
                }

                return res.status(201).json({ message: "Sighting successfully created and saved", data: savedSighting });
            } catch (err) {
                if (err.hasErrorLabel && err.hasErrorLabel("TransientTransactionError")) {
                    await new Promise((x) => setTimeout(x, (i + 1) * 100));
                    continue;
                } else if (err.code === 11000) {
                    return res.status(400).json({ message: "Duplicate sighting entry", data: {} });
                } else {
                    if (req.file && newSighting.image) {
                        await deleteFromCloudinary(newSighting.image);
                    }
                    return res.status(500).json({ message: "Error with the server/database", data: {} });
                }
            }
        }
    });

    // GET a single sighting by ID
    sightingsIdRoute.get(async function (req, res) {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: "Invalid Sighting Id", data: {} });
        }

        const query = Sighting.findById(req.params.id);
        try {
            if (req.query["select"]) { query.select(JSON.parse(req.query.select)); }
        } catch (_) {
            return res.status(400).json({ message: "Error with parsing url parameters/filters", data: {} });
        }

        try {
            const result = await query.exec();
            if (!result) {
                return res.status(404).json({ message: "Sighting not found", data: {} });
            }
            return res.status(200).json({ message: "Sighting successfully retrieved", data: result });
        } catch (_) {
            return res.status(500).json({ message: "Error with the server/database", data: {} });
        }
    });

    // PUT (update) an existing sighting and sync User.sightings
    sightingsIdRoute.put(upload.single('image'), async function (req, res) {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: "Invalid Sighting Id", data: {} });
        }

        const incomingUserId = normalizeUserId(req.body.sightingUser);

        if (incomingUserId !== "") {
            if (!mongoose.isValidObjectId(incomingUserId)) {
                return res.status(400).json({ message: "Invalid user id for sightingUser", data: {} });
            }
            const userExists = await User.findById(incomingUserId).exec();
            if (!userExists) {
                return res.status(404).json({ message: "Referenced sightingUser does not exist", data: {} });
            }
        }

        try {
            const oldSighting = await Sighting.findById(req.params.id).exec();
            if (!oldSighting) {
                return res.status(404).json({ message: "Sighting not found", data: {} });
            }

            const fallbackImage = req.body.image !== undefined ? req.body.image : oldSighting.image;
            const updateData = buildSightingData(req.body, fallbackImage, oldSighting.sightingUser);

            const tempSighting = new Sighting(updateData);
            try {
                await tempSighting.validate();
            } catch (err) {
                return res.status(400).json({ message: err.message || "Updated sighting is incorrectly formatted", data: {} });
            }

            if (req.file) {
                try {
                    const uploadResult = await uploadToCloudinary(req.file.buffer);
                    updateData.image = uploadResult.secure_url;
                } catch (_) {
                    return res.status(500).json({ message: "Failed to upload new image to Cloudinary", data: {} });
                }
            }

            const updatedSighting = await Sighting.findByIdAndUpdate(
                req.params.id,
                updateData,
                { new: true, runValidators: true }
            ).exec();

            // Delete old Cloudinary image if it was replaced or cleared
            if (oldSighting.image && oldSighting.image !== updatedSighting.image) {
                await deleteFromCloudinary(oldSighting.image);
            }

            // Sync two-way reference on User.sightings
            const sightingIdStr = updatedSighting._id.toString();
            const oldUserId = normalizeUserId(oldSighting.sightingUser);
            const newUserId = normalizeUserId(updatedSighting.sightingUser);

            // 1. If sightingUser was changed or removed, pull from the previous user
            if (oldUserId !== "" && oldUserId !== newUserId && mongoose.isValidObjectId(oldUserId)) {
                await User.findByIdAndUpdate(oldUserId, {
                    $pull: { sightings: sightingIdStr }
                }).exec();
            }

            // 2. Ensure sighting _id is present in the current sightingUser's sightings array
            if (newUserId !== "" && mongoose.isValidObjectId(newUserId)) {
                await User.findByIdAndUpdate(newUserId, {
                    $addToSet: { sightings: sightingIdStr }
                }).exec();
            }

            return res.status(200).json({ message: "Successfully updated sighting", data: updatedSighting });
        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({ message: "Duplicate sighting entry", data: {} });
            }
            return res.status(500).json({ message: "Error with the server/database", data: {} });
        }
    });

    // DELETE a sighting, remove its ID from User.sightings, and delete its image from Cloudinary
    sightingsIdRoute.delete(async function (req, res) {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: "Invalid Sighting Id", data: {} });
        }

        try {
            const deletedSighting = await Sighting.findByIdAndDelete(req.params.id).exec();
            if (!deletedSighting) {
                return res.status(404).json({ message: "Sighting not found", data: {} });
            }

            const oldUserId = normalizeUserId(deletedSighting.sightingUser);
            if (oldUserId !== "" && mongoose.isValidObjectId(oldUserId)) {
                await User.findByIdAndUpdate(oldUserId, {
                    $pull: { sightings: deletedSighting._id.toString() }
                }).exec();
            }

            if (deletedSighting.image) {
                await deleteFromCloudinary(deletedSighting.image);
            }

            return res.status(204).send();
        } catch (_) {
            return res.status(500).json({ message: "Error with the server/database", data: {} });
        }
    });

    return router;
};