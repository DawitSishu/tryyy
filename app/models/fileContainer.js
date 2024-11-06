'use strict';

var formidable = require('formidable');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var grid = require('gridfs-stream');
var fs = require('fs');
var util = require('util');
var multipart = require('multipart');
var mongoosePaginate = require('mongoose-paginate');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');

var config = require('../../config/config');
var asyncRemove = require('../helpers/async-remove');
var generateThumbnail = require('../helpers/generate-datascape-thumbnail');
var mailer = require('../../config/mailer');
var Comments = require('./comments');
var Notification = require('./notification');

// Helper function to generate a unique identifier similar to uuid
function generateUniqueId() {
    return Math.random().toString(36).substring(2, 8);
}

var FileContainerSchema = new Schema({
    dateAdded: { type: Number, default: Date.now },
    lastUpdated: { type: Number, default: Date.now },
    parent: {
        id: { type: Schema.Types.ObjectId, required: true },
        collectionName: { type: String, required: true, default: 'User' }
    },
    file: {
        name: { type: String, required: true },
        path: { type: String, required: true },
        id: { type: Object, default: mongoose.Types.ObjectId().toString() }
    },
    fileOptions: {
        keepFile: { type: Boolean, default: false }
    },
    sharedWith: { type: Array, default: [] },
    comments: { type: Array, default: [] },
    statistics: {
        viewCount: { type: Number, default: 0 }
    },
    displaySettings: {
        visibility: { type: String, default: 'PUBLIC' },
        title: { type: String },
        caption: { type: String },
        display: { type: Object, required: true, default: {} },
        legacy: { type: Object, required: true, default: {} }
    },
    localDataPath: { type: String, required: true },
    publicDataPath: { type: String, required: true },
    links: {
        parent: { type: String, required: true },
        thumbnail: { type: String, required: true },
        bullet: { type: String, required: true, unique: true },
        link: { type: String, required: true, unique: true },
        local: { type: String, required: true, unique: true },
        base: { type: String, required: true }
    }
});

FileContainerSchema.plugin(mongoosePaginate);
FileContainerSchema.index({ "parent.collectionName": 1, "parent.id": 1 });

FileContainerSchema.statics.convertDisplaySettingsToLegacy = function(displaySettings) {
    var legacySettings = {
        "fields-pca": [],
        "fields-meta": [],
        "fields-meta-id": [],
        'omit': [],
        "caption": displaySettings.caption
    };

    displaySettings.display.columnTypes.forEach(function(column, index) {
        var bucket = null;

        if (column === 'id') bucket = "fields-meta-id";
        else if (column === 'meta') bucket = "fields-meta";
        else if (column === 'omit') bucket = "omit";
        else bucket = "fields-pca";

        legacySettings[bucket].push(index + 1);
    });

    return legacySettings;
};

FileContainerSchema.statics.register = function(parent, file, settings, callback) {
    // Ensure parent.links exists with required fields
    if (!parent.links || !parent.links.link || !parent.links.local) {
        console.warn("Warning: parent.links is missing or incomplete. Setting default links.");
        parent.links = {
            link: "/default/link",   // Replace with appropriate default path
            local: "/default/local"  // Replace with appropriate default path
        };
    }

    var documentId = mongoose.Types.ObjectId();
    var fileId = mongoose.Types.ObjectId();

    var fileContainer = new this({
        _id: documentId,
        parent: {
            id: parent._id,
            collectionName: parent.__t,
            name: parent.name
        },
        file: {
            id: fileId,
            name: file.name,
            path: file.path
        },
        sharedWith: settings.sharedWith || [],
        fileOptions: settings.fileOptions,
        displaySettings: settings.displaySettings,
        localDataPath: parent.localDataPath,
        publicDataPath: parent.publicDataPath,
        links: {
            thumbnail: parent.publicDataPath + "/files/thumbnails/" + documentId + ".png",
            parent: parent.links.link,
            link: parent.links.link + "/datascapes/" + documentId,
            local: parent.links.local + "/datascapes/" + documentId,
            base: parent.links.local + "/datascapes/"
        }
    });

    fileContainer.save(callback);
};

FileContainerSchema.set('versionKey', false);

FileContainerSchema.pre('save', function(next) {
    var fileContainer = this;

    function generateUniqueBullet(callback) {
        var bullet = Math.random().toString(36).substring(2, 8);
        fileContainer.links.bullet = bullet;

        console.log("Generated bullet:", bullet);

        fileContainer.model('FileContainer').findOne({ 'links.bullet': bullet }, function(err, existing) {
            if (err) return callback(err);
            if (existing) {
                generateUniqueBullet(callback); // Bullet exists, generate a new one
            } else {
                callback(null); // Unique bullet generated
            }
        });
    }

    if (this.isNew) {
        generateUniqueBullet(function(err) {
            if (err) return next(err);
            console.log("FileContainer saved with bullet:", fileContainer.links.bullet);
            next();
        });
    } else {
        next();
    }
});

FileContainerSchema.pre('remove', function(next) {
    var fileContainer = this;
    grid.mongo = mongoose.mongo;
    var conn = mongoose.createConnection(config.db);
    var fileQuery = { _id: fileContainer.file.id, root: 'uploads' };
    var parentCollection = mongoose.model(fileContainer.parent.collectionName);

    function deleteFrom(collection, searchQuery, callback) {
        collection.findOne({ _id: searchQuery }, function(err, doc) {
            if (err) return callback(err);
            if (!doc) return callback(null);

            doc.deleteFile(fileContainer._id);
            doc.save(callback);
        });
    }

    deleteFrom(parentCollection, fileContainer.parent.id, function(deleteErr) {
        if (deleteErr) return next(deleteErr);

        conn.once('open', function() {
            grid(conn.db).remove(fileQuery, function(removeErr) {
                if (removeErr) return next(removeErr);

                // Further operations can be added here if necessary
                next();
            });
        });
    });
});

FileContainerSchema.methods.viewableTo = function(user) {
    // Check if the datascape is public or if the user is the owner
    return this.displaySettings.visibility === 'PUBLIC' || 
           (user && user._id.toString() === this.parent.id.toString());
};

module.exports = mongoose.model('FileContainer', FileContainerSchema);
