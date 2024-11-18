'use strict';

var formidable = require('formidable');
var mongoose = require('mongoose');
var grid = require('gridfs-stream');
var fs = require('fs');
var config = require('../../config/config');
var async = require('async');
var AsyncCollect = require('../helpers/async-collect').asyncCollect;

var csv = require('csv-parser');

// Load other models
var Users = mongoose.model('User');
var UnauthenticatedUsers = mongoose.model('UnauthenticatedUser');
var FileContainers = mongoose.model('FileContainer');
var Comments = mongoose.model('Comment');
var Notifications = mongoose.model('Notification');

grid.mongo = mongoose.mongo;
var conn = mongoose.createConnection(config.db);

exports.getUsers = function(req, res) {
    Users.findOne({}, function(err, doc) {
        if (err) return res.render('500');
        if (!doc) return res.render('user-not-found');
        res.send(doc);	       
    });
};

exports.getUserProfile = function(req, res) {
    var query = { _id: req.params.userID };
    
    Users.findOne(query, function(err, doc) {
        if (err) {
            res.redirect('/500');
            throw new Error(err);
        }
        if (!doc) return res.redirect('/404');

        var isOwner = req.isAuthenticated() && req.user._id.toString() === req.params.userID;
        var asyncCollect = new AsyncCollect(doc);
        var noteQuery = null;
        var fcQuery = {
            'parent.id': doc._id,
            'parent.collectionName': doc.__t,
            $or: [{ 'displaySettings.visibility': "PUBLIC" }]
        };

        if (isOwner) {
            fcQuery.$or.push({ 'displaySettings.visibility': "PRIVATE" });
            noteQuery = {
                'parent.id': doc._id,
                'parent.collectionName': doc.__t,
                read: true
            };
        }

        async.parallel(asyncCollect.getQueries(), function(asyncErr, results) {
            asyncCollect.merge(results);
            res.render('profile.ejs', {
                profile: doc,				
                user: req.user,
                isOwner: isOwner, 
                name: { name: 'name' }
            });
        });	       
    });
};

exports.getNotifications = function(req, res) {
    if (!req.isAuthenticated()) return res.redirect('/sign-in');
    
    var noteQuery = {
        'parent.id': req.user._id,
        'parent.collectionName': req.user.__t
    };
    
    Notifications.find(noteQuery, function(err, docs) {
        res.render('notifications-display.ejs', {
            user: req.user,
            notifications: docs
        });
    });
};

exports.getUserProfileComments = function(req, res) {
    Users.findOne({ _id: req.params.userID }, function(err, doc) {
        if (err || !doc) return res.sendStatus(404);

        Comments.collectByParent(doc, function(cmmtErr, comments) {
            if (cmmtErr || !comments) return res.sendStatus(404);
            res.send(Comments.jqueryCommentsTransform(comments));	    
        });
    });
};

exports.postUserProfileComment = function(req, res) {
    if (!req.isAuthenticated()) return res.status(403).send({ err: "Forbidden" });
    
    var query = { _id: req.params.userID };
    
    Users.findOne(query, function(err, doc) {
        if (err) {
            res.status(500).send({ err: "Server error" });
            throw new Error(err);
        }
        if (!doc) return res.status(404).send({ err: "User not found" });

        var comment = {
            body: req.body.body,
            subject: doc.name.first + " " + doc.name.last + "'s account"
        };
        
        req.user.leaveComment(doc, comment.subject, comment.body, function(commentError) { 
            res.send(comment.body);	    
        });
    });
};

exports.deleteAccount = function(req, res) {
    if (!req.isAuthenticated()) return res.redirect('/sign-in');
    
    var isOwner = req.user && req.user._id.toString() === req.params.userID;
    if (!isOwner) return res.redirect('/profile');

    var query = { _id: req.params.userID };
    
    Users.findOne(query, function(err, user) {
        if (err) {
            res.redirect('/500');
            throw new Error(err);
        }
        if (!user) return res.redirect('/404');

        user.remove(function(removeErr) { 
            if (removeErr) {
                res.redirect('/500');
                throw new Error(removeErr);
            } else {
                req.logout();
                res.redirect('/');
            }
        });
    });  
};

exports.authenticateAccount = function(req, res) {
    var query = { _id: req.params.authenticationCode };
    
    UnauthenticatedUsers.findOne(query, function(err, unauthenticatedUser) {
        if (err) {
            res.redirect('/500');
            throw new Error(err);
        } else if (!unauthenticatedUser) {
            return res.redirect('/404');
        }

        var newUser = Users.convert(unauthenticatedUser);
        
        newUser.save(function(saveErr) {
            if (saveErr) {
                res.redirect('/500');
                throw new Error(saveErr);
            }
            unauthenticatedUser.remove();
            res.redirect('/sign-in');
        });
    });
};

 // Ensure this is imported at the top of your file
 // Ensure you have installed this package

 exports.createDataset = function (req, res) {
    console.log("Starting to process the form submission for Paint Datascape...");
    var form = new formidable.IncomingForm();

    form.parse(req, function (err, fields, files) {
        if (err) {
            console.error("Error parsing form:", err.message);
            return res.status(500).json({ success: false, message: "Server error" });
        }

        var file = files.file;
        if (!file) {
            console.warn("No file uploaded");
            return res.status(400).json({ success: false, message: "Please upload a .csv file" });
        }

        // Default legacy config
        const defaultLegacyConfig = {
            "fields-pca": [],
            "fields-meta": [],
            "fields-meta-id": [],
            "omit": [],
            "caption": fields.displaySettings?.caption || "Default caption"
        };

        // Parse `revertUponArival` to get `columnTypes`
        let revertUponArival;
        try {
            revertUponArival = JSON.parse(fields.revertUponArival);
        } catch (parseError) {
            console.error("Error parsing revertUponArival JSON:", parseError.message);
            return res.status(400).json({ success: false, message: "Invalid data format" });
        }

        const columnTypes = revertUponArival.displaySettings.display.columnTypes;

        // Map column types to legacy config
        columnTypes.forEach((type, index) => {
            switch (type) {
                case "omit":
                    defaultLegacyConfig.omit.push(index + 1); // Store 1-based index
                    break;
                case "meta":
                    defaultLegacyConfig["fields-meta"].push(index + 1);
                    break;
                case "id":
                    defaultLegacyConfig["fields-meta-id"].push(index + 1);
                    break;
                case "axis":
                    defaultLegacyConfig["fields-pca"].push(index + 1);
                    break;
                default:
                    break; // Ignore any unexpected types
            }
        });

        // Prepare settings, including the legacy configuration
        var settings = {
            displaySettings: {
                title: fields.title || 'Untitled Datascape',
                visibility: fields.privacySettings || 'PUBLIC',
                legacy: defaultLegacyConfig // Add the legacy configuration here
            },
            fileOptions: { keepFile: true }
        };

        // Register the file with the user and process CSV data
        req.user.registerFile(file, settings, function (err, registeredFile) {
            if (err) {
                console.error("Error registering file:", err.message);
                return res.status(500).json({ success: false, message: "Failed to register file" });
            }

            var csvData = [];
            fs.createReadStream(file.path)
                .pipe(csv())
                .on('data', function (row) {
                    var rowArray = Object.values(row);
                    csvData.push(rowArray);
                })
                .on('end', function () {
                    console.log('CSV data parsing complete. Total rows parsed:', csvData.length);

                    // Respond with JSON instead of rendering
                    return res.status(200).json({
                        success: true,
                        message: "Datascape created successfully.",
                        bullet: registeredFile.links.bullet,
                        csvPreview: csvData.slice(0, 10), // Optional: send a preview of the data
                        datascape: {
                            displaySettings: settings.displaySettings,
                            links: registeredFile.links,
                            parent: req.user ? {
                                firstName: req.user.name?.first || 'Unknown',
                                lastName: req.user.name?.last || 'User'
                            } : null
                        }
                    });
                })
                .on('error', function (error) {
                    console.error("Error parsing CSV file:", error.message);
                    return res.status(500).json({
                        success: false,
                        message: "Error parsing CSV file."
                    });
                });
        });
    });
};

exports.profileSettings = function(req, res) {
    var isOwner = req.isAuthenticated() && req.user && req.user._id.toString() === req.params.userID;
    if (!isOwner) return res.redirect('/');
    
    var query = { _id: req.user._id };
    
    Users.findOne(query, function(err, doc) {
        if (err) {
            res.redirect('/500');
            throw new Error(err);
        }
        if (!doc) return res.redirect('/404');
        res.render('profile-settings.ejs', { user: req.user, profile: doc });
    });
};

exports.editProfileSettings = function(req, res) {
    var isOwner = req.isAuthenticated() &&
        req.user !== undefined && 
        req.user._id.toString() === req.params.userID;
    
    if (!isOwner) return res.status(403).send({ err: "Forbidden" });
    
    var query = { _id: req.user._id };
    
    var form = new formidable.IncomingForm();
    form.uploadDir = __dirname + "../../../data/temp";
    form.keepExtensions = true;
    
    form.parse(req, function(err, fields, files) {
        if (err) {
            res.status(500).send({ err: "Server error" });
            throw new Error(err);
        }
        
        Users.findOne(query, function(userErr, doc) {
            if (userErr) {
                res.status(500).send({ err: "Server error" });
                throw new Error(userErr);
            }
            if (!doc) return res.status(404).send({ err: "User not found" });

            doc.profileSettings.displayEmail = fields.displayEmail === 'true';
            doc.fileSettings.defaults.visibility = fields.defaultVisibility;
            
            if (fields.newPassword && fields.newPassword !== '') {
                doc.password = Users.generateHash(fields.newPassword);
            }
            
            if (files.file) {
                fs.rename(files.file.path, doc.localDataPath + '/imgs/avatar', function(writeErr) {
                    doc.links.avatar = doc.publicDataPath + '/imgs/avatar';
                    if (writeErr) {
                        res.status(500).send({ err: "Server error" });
                        throw new Error(writeErr);
                    }
                    doc.save(function(saveErr) {
                        if (saveErr) {
                            res.status(500).send({ err: "Server error" });
                            throw new Error(saveErr);
                        }
                        res.send(doc.links.local);
                    });
                });
            } else {  
                doc.save(function(saveErr) {
                    if (saveErr) {
                        res.status(500).send({ err: "Server error" });
                        throw new Error(saveErr);
                    }
                    res.send(doc.links.local);
                });
            }
        });
    });
};
