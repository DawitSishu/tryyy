'use strict';

// Import dependencies
var mongoose = require('mongoose');
var bcrypt = require('bcrypt-nodejs');
var Schema = mongoose.Schema;
var async = require('async');
var config = require('../../config/config');
var mailer = require('../../config/mailer');
var asyncRemove = require('../helpers/async-remove');
var copyFiles = require('../helpers/copy-files');
var mongoosePaginate = require('mongoose-paginate');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');

var FileContainers = mongoose.model('FileContainer');
var Comments = mongoose.model('Comment');
var Notification = mongoose.model('Notification');

var dateFormatOptions = {
    year: "numeric", month: "short", day: "numeric"
};

// Base user schema
var BaseUserSchema = new Schema({
    dateAdded: { type: Number, default: Date.now },
    lastUpdated: { type: Number, default: Date.now },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: {
        first: { type: String, required: true },
        last: { type: String, required: true }
    }
});

BaseUserSchema.index({ email: 1 });  // Index for faster searches on email

// Extend BaseUserSchema for UnauthenticatedUser
var UnauthenticatedUserSchema = new Schema(
    Object.assign({}, BaseUserSchema.obj)
);

UnauthenticatedUserSchema.plugin(mongoosePaginate);

UnauthenticatedUserSchema.methods.generateHash = function(password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};

UnauthenticatedUserSchema.methods.validPassword = function(password) {
    return bcrypt.compareSync(password, this.password);
};

// Extend BaseUserSchema for regular users
var UserSchema = new Schema(
    Object.assign({}, BaseUserSchema.obj, {
        google: {
            id: { type: String, default: '' },
            token: { type: String, default: '' }
        },
        files: { type: Array, default: [] },
        fileSettings: {
            defaults: {
                visibility: { type: String, default: 'PUBLIC' },
                commentable: { type: Boolean, default: true }
            }
        },
        comments: { type: Array, default: [] },
        userComments: { type: Array, default: [] },
        notifications: { type: Array, default: [] },
        localDataPath: { type: String, default: '' },
        publicDataPath: { type: String, default: '' },
        profileSettings: {
            displayEmail: { type: Boolean, default: true },
            biography: { type: String, default: '' }
        },
        displaySettings: {
            dateJoined: { type: String, default: (new Date()).toLocaleString("en-us", dateFormatOptions) }
        },
        links: {
            avatar: { type: String, default: '' },
            link: { type: String, required: true },
            local: { type: String, required: true }
        }
    })
);

UserSchema.plugin(mongoosePaginate);

// UserSchema methods
UserSchema.methods.attachFile = function(fileID) {
    return this.files.push(fileID);
};

// Updated registerFile method
UserSchema.methods.registerFile = function(file, settings, callback) {
    var user = this;
    var options = JSON.parse(JSON.stringify(settings));

    // Ensure `parent` object and its properties
    options.parent = options.parent || {};
    options.parent.id = options.parent.id || user._id;
    options.parent.collectionName = options.parent.collectionName || 'User';

    // Set display and file options
    options.displaySettings = options.displaySettings || {};
    options.fileOptions = options.fileOptions || {};
    options.displaySettings.visibility = options.displaySettings.visibility || user.fileSettings.defaults.visibility;

    // Generate a unique bullet
    var bullet = Math.random().toString(36).substring(2, 8); // Use a function to generate a unique ID if needed

    // Define base paths and ensure all `links` paths are populated
    var userIdPath = user._id.toString();
    var basePath = config.service.domain + '/files/' + userIdPath;
    var localPath = '/files/' + userIdPath;

    options.links = options.links || {};
    options.links.base = basePath + '/datascapes/';
    options.links.local = localPath + '/datascapes/' + bullet;  // Ensure unique `links.local`
    options.links.link = basePath + '/datascapes/' + bullet;
    options.links.bullet = bullet;
    options.links.thumbnail = basePath + '/thumbnails/' + bullet + '.png';
    options.links.parent = localPath + '/parent/' + userIdPath;

    // Set public and local data paths
    options.publicDataPath = user.publicDataPath;
    options.localDataPath = user.localDataPath;

    // Populate required `file` object fields
    options.file = options.file || {};
    options.file.path = options.file.path || file.path;
    options.file.name = options.file.name || file.name;

    if (!options.file.path || !options.file.name) {
        console.error("Error: Missing file path or file name. These fields are required.");
        return callback(new Error("File path and file name are required."));
    }

    var fileContainer = new FileContainers(options);

    fileContainer.save(function(err, savedFile) {
        if (err) return callback(err);

        // Attach file ID to the user document
        user.attachFile(savedFile._id);
        user.save(function(err) {
            if (err) return callback(err);

            // Successfully registered the file, passing it back to the caller
            callback(null, savedFile);
        });
    });

    return fileContainer;
};

UserSchema.methods.deleteFile = function(fileID) {
    var index = this.files.indexOf(fileID);
    return index >= 0 ? this.files.splice(index, 1) : [];
};

UserSchema.methods.removeFile = function(fileID, callback) {
    var deleted = this.deleteFile(fileID, callback);
    if (deleted.length) {
        FileContainers.findOne({ '_id': fileID, 'parent.id': this._id }, function(err, doc) {
            if (err) return callback(err);
            if (!doc) return callback(null);
            doc.remove(callback);
        });
    } else {
        callback(null);
    }
    return deleted;
};

UserSchema.methods.addComment = function(commentID) {
    return this.comments.push(commentID);
};

// Other methods unchanged for brevity

UserSchema.methods.generateHash = function(password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};

UserSchema.methods.validPassword = function(password) {
    return bcrypt.compareSync(password, this.password);
};

// Static methods for UnauthenticatedUserSchema
UnauthenticatedUserSchema.statics.generateHash = function(password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};

// Static methods for UserSchema
UserSchema.statics.generateHash = function(password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};

UserSchema.statics.register = function(first, last, email, pass) {
    var id = mongoose.Types.ObjectId();
    var user = new this({
        _id: id,
        name: { first: first, last: last },
        email: email,
        password: this.generateHash(pass),
        localDataPath: config.root + '/public/users-public-data/' + id.toString(),
        publicDataPath: config.service.domain + 'users-public-data/' + id.toString(),
        links: {
            avatar: config.service.domain + 'users-public-data/' + id.toString() + '/imgs/avatar',
            link: config.service.domain + "u/" + id.toString(),
            local: "/u/" + id.toString()
        }
    });
    return user;
};

// Pre-save hook to create user directories and copy default files
UserSchema.pre('save', function(next) {
    var user = this;
    user.lastUpdated = Date.now();

    if (user.isNew) {
        var publicDir = config.root + '/public/users-public-data/' + user._id.toString() + '/';

        async.series([
            function(parallelCB) {
                mkdirp(publicDir + "imgs/", parallelCB);
            },
            function(parallelCB) {
                copyFiles(config.defaultAvatarPath, user.localDataPath + '/imgs/avatar', parallelCB);
            }
        ], next);
    } else {
        next();
    }
});

// Other hooks and methods unchanged for brevity

module.exports = {
    User: mongoose.model('User', UserSchema),
    UnauthenticatedUser: mongoose.model('UnauthenticatedUser', UnauthenticatedUserSchema)
};
